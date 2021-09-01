import './app.css';
import { autoinject, bindable } from "aurelia-framework";
import { EventAggregator } from 'aurelia-event-aggregator';
import axios from 'axios';

import { Auth } from './resources/auth';

import CeramicClient from '@ceramicnetwork/http-client';
import { IDX, getLegacy3BoxProfileAsBasicProfile } from '@ceramicstudio/idx';

interface IMessage {
  _id: string,
  text: string,
  author: string,
  metadata: any,
  showReply: boolean,
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
  private comments: any;
  private idx: IDX;
  private chainId: string|number;
  private messagesService: NodeJS.Timeout;
  private inputRef: HTMLTextAreaElement;
  private auth: Auth = new Auth();
  
  constructor() {
    this.message = "";
  }

  toggleReply(_id: string): void {
    const message = this.messages.filter(message => message._id === _id)[0]
    message.showReply = !message.showReply;
  }

  public async attached():Promise<void> {

    const ceramic = new CeramicClient(process.env.CERAMIC_API_URL);
    this.idx = new IDX({ ceramic })

    this.inputRef.addEventListener('keydown', (e) => this.handleKeypress(e));

    await this.auth.init();
    this.loadConversation()
    const messagesElem = window.document.querySelector('.messages')
    messagesElem.scrollTop = messagesElem.scrollHeight;

    this.messagesService = global.setInterval(()=>this.loadConversation(), 1000);

    // if (this.auth.isConnected) {
    //   // metamask is connected
    //   this.auth.wallet.address = (await this.auth.provider.listAccounts())[0];
    //   console.log('metamask connected to', this.auth.wallet.address);
    // } else {
    //   // metamask is not connected
    //   console.log('metamask not connected');
    // }
  }

  deactivate(): void {
    clearInterval(this.messagesService);
  }

  async addMessage(commentID = '', message = ''): Promise<void> {
    if(!message) return;

    const auth = await this.auth.signThread();
    const token = auth.message;

    try {
      // Profile imported from ceramic IDX
      const profile = await this.loadProfile(this.auth.wallet.address);
      const res = await axios.post(`https://theconvo.space/api/comments?${commentID? 'replyTo=' + commentID + '&':''}apikey=${ process.env.CONVO_API_KEY }`, {
        'token': token,
        'signerAddress': this.auth.wallet.address,
        'comment': message,
        'metadata': profile,
        'threadId': `cl_descussion:${this.auth.chainId}`,
        'url': encodeURIComponent( process.env.APP_URL ),
      });

      if(res.status === 200) this.message = "";
    } catch (error) {
      console.error(error.message);
    }
  }

  async voteMessage(type: string): Promise<void> {
    let token = "";
    if(!(await this.auth.isValidAuth)) {
      const auth = await this.auth.signThread();
      token = auth.message;
    } else {
      token = JSON.parse(localStorage.getItem('signature')).message;
    }
  }

  handleKeypress(event: KeyboardEvent): void {
    if (event.shiftKey && event.key === 'Enter') {
      event.preventDefault();
      this.addMessage('', this.message);
    }
  }

  async loadProfile(author: string): Promise<IProfile> {
    // // Get the IDX profile
    // return await idx.get('basicProfile', message.author + '@eip155:1').then((profile) => {
    //   // Currently IDX.get returns Promise<unknown>
    //   // Follow changes on: https://developers.idx.xyz/reference/idx/#get
    //   if(profile !== null) {
    //     return {
    //       address: message.author,
    //       image: 'https://icon-library.com/images/vendetta-icon/vendetta-icon-14.jpg',
    //       name: 'Anonymous',
    //     }
    //   }
    // });

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
    
    if(newMessages.length && newMessages.length !== this.messages.length) {
      newMessages.map(async message => {
        if(message && !message.metadata.address) message.metadata = await this.loadProfile(message.author);
      });
      this.messages = newMessages;
      const messagesElem = await window.document.querySelector('.messages')
      messagesElem.scrollTop = messagesElem.scrollHeight;
    }

  }
}
