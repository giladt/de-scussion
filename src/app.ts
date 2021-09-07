import './app.css';
import { autoinject, bindable } from "aurelia-framework";
import { EventAggregator } from 'aurelia-event-aggregator';
import axios from 'axios';
import { format, formatDistanceToNowStrict } from 'date-fns'
import { Auth } from './resources/auth';

import CeramicClient from '@ceramicnetwork/http-client';
import { IDX, getLegacy3BoxProfileAsBasicProfile } from '@ceramicstudio/idx';
import { Realtime } from "ably/promises";

interface IMessage {
  _id: string,
  text: string,
  author: string,
  metadata: any,
  replyTo?: string,
  upvote: number,
  downvote: number,
  timestamp: number,
}

interface IProfile {
  address: string,
  image: string,
  name: string,
}

@autoinject
export class App {
  private title = 'De-scussion';
  private messages: Array<IMessage> = [];
  private message: string;
  private idx: IDX;
  private inputRef: HTMLTextAreaElement;
  private auth: Auth = new Auth();
  private showReply = '';
  private channelName: string;
  private channel: any;
  
  @bindable isLoading = false;
  async init(): Promise<void> {
    await this.auth.init();
    this.channelName = `cl_descussion:${await this.auth.chainId}`;

    const ably = new Realtime.Promise({ authUrl: `https://theconvo.space/api/getAblyAuth?apikey=${ process.env.CONVO_API_KEY }` });
    this.channel = await ably.channels.get(this.channelName);
  }

  constructor() {
    this.message = "";
  }
  
  toggleReply(_id: string): void {
    const message = this.messages.filter(message => message._id === _id)[0]
    this.showReply = this.showReply === '' ? _id : '';
  }
  
  public async attached():Promise<void> {
    await this.init();
    console.log(await this.channel);
    await this.channel.subscribe(async message => {
      console.log('new message came: ',{message: message.data});
      if(!this.messages.includes(message._id)){
        this.messages.push(message.data);
        const messagesElem = await window.document.querySelector('.container');
        window.scrollTo(0,messagesElem.scrollHeight);
      }
    });

    const ceramic = new CeramicClient(process.env.CERAMIC_API_URL);
    this.idx = new IDX({ ceramic })

    this.inputRef.addEventListener('keydown', (e) => this.handleKeypress(e));

    await this.loadConversation();
    const messagesElem = window.document.querySelector('.container');
    window.scrollTo(0,messagesElem.scrollHeight);

    // this.messagesService = global.setInterval(()=>this.loadConversation(), 1000);
  }

  deactivate(): void {
    // clearInterval(this.messagesService);
    this.channel.unsubscribe();
  }

  async addMessage(message = ''): Promise<void> {
    if(!message) return;
    this.isLoading = true;

    const auth = await this.auth.signThread();
    const token = auth.message;

    try {
      // Profile imported from ceramic IDX
      const profile = await this.loadProfile(this.auth.wallet.address);
      const url = `https://theconvo.space/api/comments?apikey=${ process.env.CONVO_API_KEY }`;
      
      const res = await axios.post(url, {
        'token': token,
        'signerAddress': this.auth.wallet.address,
        'comment': message,
        'metadata': profile,
        'replyTo' : this.showReply,
        'threadId': this.channelName,
        'url': encodeURIComponent( process.env.APP_URL ),
      });

      if(res.status === 200) {
        this.isLoading = false;
        this.message = "";
        this.showReply = '';
        this.messages.push(res.data);
        const messagesElem = await window.document.querySelector('.container');
        window.scrollTo(0,messagesElem.scrollHeight);
      }
    } catch (error) {
      this.isLoading = false;
      console.error(error.message);
    }
  }

  async voteMessage(_id: string, type: string): Promise<void> {
    this.isLoading = true;
    if(!this.auth.wallet) return;
    const auth = await this.auth.signThread();
    if(!auth.success) return;

    const token = auth.message;
    try {
      const message = await (await axios.get(`https://theconvo.space/api/comment?commentId=${_id}&apikey=${ process.env.CONVO_API_KEY }`)).data;
      const types = ['toggleUpvote','toggleDownvote'];
      const endpoints = {toggleUpvote: 'upvotes',toggleDownvote: 'downvotes'};
      const typeInverse = types[types.length - types.indexOf(type) - 1];
      
      if(message[endpoints[typeInverse]].includes(this.auth.wallet.address)) {
        await axios.post(`https://theconvo.space/api/vote?apikey=${ process.env.CONVO_API_KEY }`, {
          'signerAddress': this.auth.wallet.address,
          'token': token,
          'commentId': _id,
          'type': typeInverse,
        });
      }

      await axios.post(`https://theconvo.space/api/vote?apikey=${ process.env.CONVO_API_KEY }`, {
        'signerAddress': this.auth.wallet.address,
        'token': token,
        'commentId': _id,
        'type': type,
      });
      this.isLoading = false;
    } catch (error) {
      console.error(error.message);
    }
  }

  handleKeypress(event: KeyboardEvent): void {
    if (event.shiftKey && event.key === 'Enter') {
      event.preventDefault();
      this.addMessage(this.message);
    }
  }

  async loadProfile(author: string): Promise<IProfile> {
    // Get the IDX profile
    try {
      const profile:any = await this.idx.get('basicProfile', author + '@eip155:' + this.auth.chainId)
      // Currently IDX.get returns Promise<unknown>
      // Follow changes on: https://developers.idx.xyz/reference/idx/#get
      console.log('did',profile);
      if(profile !== null) {
        return {
          address: author,
          image: profile.image.original.src.replace('ipfs://', 'https://ipfs.io/ipfs/'),
          name: profile.name,
        };
      }

      return {
        address: author,
        image: 'https://icon-library.com/images/vendetta-icon/vendetta-icon-14.jpg',
        name: 'Anonymous',
      }
    } catch (error) {
      console.error('No DID Profile. Fallback to 3Box', error.message);
    }

    // Retrieve profile info from (legacy) 3Box
    return await getLegacy3BoxProfileAsBasicProfile(author).then(profile => {

      if(profile !== null) {
        return {
          address: author,
          image: profile.image.original.src.replace('ipfs://', 'https://ipfs.io/ipfs/'),
          name: profile.name,
        }
      } else {
        return {
          address: author,
          image: null,
          name: null,
        };
      }
    });
  }

  async loadConversation():Promise<void> {
    const newMessages = (await axios.get(`https://theconvo.space/api/comments?threadId=cl_descussion:${this.auth.chainId}&apikey=${ process.env.CONVO_API_KEY }`)).data;

    if(newMessages && JSON.stringify([...newMessages]) !== JSON.stringify([...this.messages])) {
      newMessages.map(async message => {
        if(message && !message.metadata.address) message.metadata = await this.loadProfile(message.author);
      });
      this.messages = JSON.parse(JSON.stringify(newMessages));
    }
  }

  jump(id: string): void {
    const el = document.getElementById(id);
    el.scrollIntoView({behavior: 'smooth'});
    el.classList.add('animate')
    setTimeout((): void => {
      el.classList.remove('animate')
    }, 2500);
  }

  getTimeDistance(date: string): string {
  
    const formatDistanceLocale = {
      lessThanXSeconds: '{{count}}s',
      xSeconds: '{{count}}s',
      halfAMinute: '30s',
      lessThanXMinutes: '{{count}}m',
      xMinutes: '{{count}}m',
      aboutXHours: '{{count}}h',
      xHours: '{{count}}h',
      xDays: '{{count}}d',
      aboutXWeeks: '{{count}}w',
      xWeeks: '{{count}}w',
      aboutXMonths: '{{count}}m',
      xMonths: '{{count}}m',
      aboutXYears: '{{count}}y',
      xYears: '{{count}}y',
      overXYears: '{{count}}y',
      almostXYears: '{{count}}y',
    }

    function formatDistance(token, count, options) {
      options = options || {}

      const result = formatDistanceLocale[token].replace('{{count}}', count)

      if (options.addSuffix) {
        if (options.comparison > 0) {
          return 'in ' + result
        } else {
          return result + ' ago'
        }
      }

      return result
    }

    return formatDistanceToNowStrict(new Date(parseInt(date)), {addSuffix: false, locale: { formatDistance}});
  }

  getReplyOrigin(message: IMessage): IMessage {
    if(message.replyTo) {
      return this.messages.filter(origin => {
        return origin._id === message.replyTo;
      })[0];
    }
  }

}
