import './app.css';
import { autoinject } from "aurelia-framework";
import { ethers } from 'ethers';
import axios from 'axios';

import CeramicClient from '@ceramicnetwork/http-client';
import { IDX, getLegacy3BoxProfileAsBasicProfile } from '@ceramicstudio/idx';

interface IMessage {
  origin: string,
  content: string,
  author: string,
  profile: IProfile,
}

interface IProfile {
  address: string,
  image: string,
  name: string,
}

@autoinject
export class App {
  public title = 'De-scussion';
  public messages: Array<IMessage> = [];
  private message: string;
  private auth: { 
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
  };
  public comments: any;

  public wallet: {
    address: string,
  };

  private inputRef: HTMLTextAreaElement;
  private provider: any;

  private serverWeb3 = new ethers.providers.InfuraProvider(null, process.env.INFURA_ID)

  constructor() {
    this.message = "";
    this.wallet = {
      address: '',
    }
  }

  async isConnected():Promise<boolean> {
    this.provider = (window as any).ethereum;
    if(await this.provider.selectedAddress) {
      console.log('constructor provider:',this.provider);
      this.wallet.address = await this.provider.selectedAddress;
      return true;
    }
    return false;
  }

  public async attached():Promise<void> {
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
    }

    const isMetaMaskConnected = async () => {
      const accounts = await this.provider.listAccounts();
      return accounts.length > 0;
    }

    isMetaMaskConnected().then(async (connected) => {
      if (connected) {
        // metamask is connected
        this.wallet.address = (await this.provider.listAccounts())[0];
        console.log('metamask connected', this.wallet.address);

        this.messages = (await axios.get(`https://theconvo.space/api/comments?threadId=cl_descussion&apikey=${ process.env.CONVO_API_KEY }`)).data;
        if(this.messages.length) {
          const ceramic = new CeramicClient(process.env.CERAMIC_API_URL);
          const idx = new IDX({ ceramic })

          for(const message of this.messages){
            if(message.author) {

              // // Get the IDX profile
              // idx.get('basicProfile', message.author + '@eip155:1').then((profile) => {
              //   // Currently IDX.get returns Promise<unknown>
              //   // Follow changes on: https://developers.idx.xyz/reference/idx/#get
              //   if(profile !== null) {
              //     message.profile= {
              //       address: message.author,
              //       image: 'https://icon-library.com/images/vendetta-icon/vendetta-icon-14.jpg',
              //       name: 'Anonymous',
              //     }
              //   }
              // });

              // Retrieve profile info from (legacy) 3Box
              getLegacy3BoxProfileAsBasicProfile(message.author).then(profile => {
                if(profile !== null) {
                  message.profile= {
                    address: message.author,
                    image: profile.image.original.src.replace('ipfs://', 'https://ipfs.io/ipfs/'),
                    name: profile.name,
                  }
                }
              });
            }
          }
        }
        console.log('messages:', this.messages);
      } else {
        // metamask is not connected
        console.log('metamask not connected');
      }
    });
  }

  async addMessage(): Promise<void> {
    if(!this.message) return;

    const auth = await this.signThread();

    const res = await axios.post(`https://theconvo.space/api/comments?apikey=${ process.env.CONVO_API_KEY }`, {
      'token': auth.message,
      'signerAddress': this.wallet.address,
      'comment': this.message,
      'threadId': 'cl_descussion',
      'url': encodeURIComponent( process.env.APP_URL ),
    })
    this.messages = (await axios.get(`https://theconvo.space/api/comments?threadId=cl_descussion&apikey=${ process.env.CONVO_API_KEY }`)).data;
    this.message = "";
  }

  handleKeypress(event: KeyboardEvent): void {
    if (event.shiftKey && event.key === 'Enter') {
      event.preventDefault();
      this.addMessage();
    }
  }

  async connect():Promise<void> {
    if(!this.provider.listAccounts().length) {
      const { ethereum } = (window as any);
      this.provider = await new ethers.providers.Web3Provider(ethereum, 'any');
      await this.provider.send("eth_requestAccounts", []);
      this.wallet.address = (await this.provider.listAccounts())[0];

      this.comments = await axios.get(`https://theconvo.space/api/comments?threadId=cl_descussion&apikey=${ process.env.CONVO_API_KEY }`);

    } else {
      console.log('provider:',this.provider);
      this.wallet.address = (await this.provider.listAccounts())[0];
    }
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
          console.log({ signature , signerAddress , timestamp});

          const auth = (await axios.post(
            `https://theconvo.space/api/auth?apikey=${ process.env.CONVO_API_KEY }`, 
            {
              signerAddress,
              signature,
              timestamp,
            }
          ));
          console.log('auth:',this.auth);
          if(auth.data.success){
            console.log('auth:',this.auth);
            console.log('signature:', signature);

            localStorage.setItem('signature', JSON.stringify(auth.data));
          }
        } catch (e) {
          console.log('User denied signature:', e);
        }
      }
    }

    return JSON.parse(localStorage.getItem('signature'));
  }
}
