import './app.css';
import { ethers } from 'ethers';
import axios from 'axios';
import { HttpClient, json } from 'aurelia-fetch-client';
import { inject } from 'aurelia-framework';

interface IMessage {
  origin: string,
  content: string,
}

interface IProfile {
  cid: string,
  avatar: string,
  name: string,
}

@inject(HttpClient)
export class App {
  public title = 'De-scussion';
  public messages: Array<IMessage> = [];
  private message: string;
  private auth: { success: boolean, message: string };

  public wallet: {
    address: string,
  };

  private inputRef: HTMLTextAreaElement;
  private provider: any;
  private http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
    const baseUrl = `https://theconvo.space/api/auth?apikey=CONVO`
    http.configure(config => {
      config.withBaseUrl(baseUrl);
    });
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
            console.log('metamask connected', (await this.provider.listAccounts())[0]);
            this.wallet.address = (await this.provider.listAccounts())[0];
        } else {
            // metamask is not connected
            console.log('metamask not connected');
        }
    });
  }

  async addMessage(): Promise<void> {
    if(!this.message) return;

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

          this.auth = (await axios.post(`https://theconvo.space/api/auth`, {
            signerAddress,
            signature,
            timestamp,
          }));
          console.log('auth:',this.auth);
          console.log('signature:', signature);
          console.log('threads:', this.auth);
        } catch (e) {
          console.log('User denied signature:', e);
        }
      }

      const payload = {
      origin: this.wallet.address,
      content: this.message.replace(/\n/g, '<br>'),
    }
    this.messages.push(payload);
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
    } else {
      console.log('provider:',this.provider);
      this.wallet.address = (await this.provider.listAccounts())[0];
    }
  }
}
