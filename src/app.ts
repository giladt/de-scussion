import './app.css';
import { autoinject } from "aurelia-framework";
import { EventAggregator } from 'aurelia-event-aggregator';
import { ethers } from 'ethers';
import axios from 'axios';

import CeramicClient from '@ceramicnetwork/http-client';
import { IDX, getLegacy3BoxProfileAsBasicProfile } from '@ceramicstudio/idx';

interface IMessage {
  text: string,
  author: string,
  profile: IProfile,
}

interface IProfile {
  address: string,
  image: string,
  name: string,
}

interface IAuth { 
  data: {
    success: boolean, 
    message: string 
  },
  status: number,
  statusText: string,
  headers: {
    'content-type': string,
    'cache-control': string,
    'content-length': string,
  },
  config: {
    url: string,
    method: string,
    data: string,
    headers: {
      'Content-Type': string,
      Accept: string,
    },
  },
}

@autoinject
export class App {
  public title = 'De-scussion';
  public messages: Array<IMessage> = [];
  private message: string;
  private auth: IAuth;
  public comments: any;
  public isConnected = false;
  private idx: IDX;
  private chainId: string;

  public wallet: {
    address: string,
  };

  private inputRef: HTMLTextAreaElement;
  private provider: any;

  // private serverWeb3 = new ethers.providers.InfuraProvider(null, process.env.INFURA_ID)

  constructor() {
    this.message = "";
    this.wallet = {
      address: '',
    }
  }

  // async isConnected():Promise<boolean> {
  //   this.provider = (window as any).ethereum;
  //   if(await this.provider.selectedAddress) {
  //     console.log('constructor provider:',this.provider);
  //     this.wallet.address = await this.provider.selectedAddress;
  //     return true;
  //   }
  //   return false;
  // }

  public async attached():Promise<void> {
    const ceramic = new CeramicClient(process.env.CERAMIC_API_URL);
    this.idx = new IDX({ ceramic })

    this.inputRef.addEventListener('keydown', (e) => this.handleKeypress(e));

    // // Force page refreshes on network changes
    // {
    //     // The "any" network will allow spontaneous network changes
    //     const provider = new ethers.providers.Web3Provider(window.ethereum, "any");
    //     provider.on("network", (newNetwork, oldNetwork) => {
    //         // When a Provider makes its initial connection, it emits a "network"
    //         // event with a null oldNetwork along with the newNetwork. So, if the
    //         // oldNetwork exists, it represents a changing network
    //         if (oldNetwork) {
    //             window.location.reload();
    //         }
    //     });
    // }

    const { ethereum } = (window as any);
    if (ethereum) {
      this.provider = new ethers.providers.Web3Provider(ethereum);
      this.chainId = await this.provider.getNetwork().then(network => network.chainId);
    }

    this.loadConversation();

    const accounts = await this.provider.listAccounts();
    this.isConnected = accounts.length>0;

    if (this.isConnected) {
      // metamask is connected
      this.wallet.address = (await this.provider.listAccounts())[0];
      console.log('metamask connected to', this.wallet.address);
    } else {
      // metamask is not connected
      console.log('metamask not connected');
    }

  }

  async addMessage(): Promise<void> {
    if(!this.message) return;

    const auth = await this.signThread();

    try {
      const res = await axios.post(`https://theconvo.space/api/comments?apikey=${ process.env.CONVO_API_KEY }`, {
        'token': auth.message,
        'signerAddress': this.wallet.address,
        'comment': this.message,
        'threadId': `cl_descussion:${this.chainId}`,
        'url': encodeURIComponent( process.env.APP_URL ),
      });
      if(res.status === 200) {
        const profile = await this.loadProfile(this.wallet.address);
        this.messages.push({
          author: this.wallet.address,
          text: this.message,
          profile: {
            address: profile.address,
            image: profile.image,
            name: profile.name,
          } as IProfile,
        } as IMessage);
        this.message = "";
      }
    } catch (error) {
      console.error(error.message);
    }
  }

  handleKeypress(event: KeyboardEvent): void {
    if (event.shiftKey && event.key === 'Enter') {
      event.preventDefault();
      this.addMessage();
    }
  }

  // User pressed the "Connect to wallet" button
  async connect():Promise<void> {
    if(!this.provider.listAccounts().length) {
      const { ethereum } = (window as any);
      this.provider = await new ethers.providers.Web3Provider(ethereum, 'any');
      await this.provider.send("eth_requestAccounts", []);
      this.wallet.address = (await this.provider.listAccounts())[0];

      this.isConnected = true;
    } else {
      console.log('provider:',this.provider);
      this.wallet.address = (await this.provider.listAccounts())[0];
    }
  }

  async isMetaMaskConnected():Promise<void> {
    const accounts = await this.provider.listAccounts();
    this.isConnected = accounts.length > 0;
  }

  async signThread():Promise<{success: boolean, message: string}> {
    if(!localStorage.getItem('signature')) {
      // Sample signature generation code using ethers.js
      const timestamp = Date.now();
      const signer = await this.provider.getSigner();
      const signerAddress = await signer.getAddress();
      const data = `I allow this site to access my data on The Convo Space using the account ${signerAddress}. Timestamp:${timestamp}`;

      if(!this.auth) {
        try {
          const signature = await this.provider.send(
            'personal_sign',
            [ ethers.utils.hexlify(ethers.utils.toUtf8Bytes(data)), signerAddress.toLowerCase() ]
            );

          const auth = (await axios.post(
            `https://theconvo.space/api/auth?apikey=${ process.env.CONVO_API_KEY }`, 
            {
              signerAddress,
              signature,
              timestamp,
            }
          ));

          if(auth.data.success){
            localStorage.setItem('signature', JSON.stringify(auth.data));
          }
        } catch (e) {
          console.log('User denied signature:', e);
        }
      }
    }

    return JSON.parse(localStorage.getItem('signature'));
  }

  async loadProfile(author): Promise<IProfile> {
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
      }
    });
  }

  async loadConversation():Promise<void> {
    this.messages = (await axios.get(`https://theconvo.space/api/comments?threadId=cl_descussion:${this.chainId}&apikey=${ process.env.CONVO_API_KEY }`)).data;
    if(this.messages.length) {

      for(const message of this.messages){
        if(message.author) {
          const profile = await this.loadProfile(message.author);
          message.profile = profile;
        }
      }
    }
  }
}
