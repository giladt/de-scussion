import './app.css';
import { ethers } from 'ethers';

// import CeramicClient from '@ceramicnetwork/http-client';
// import KeyDidResolver from 'key-did-resolver';
// import ThreeIdResolver from '@ceramicnetwork/3id-did-resolver';
// import { ThreeIdConnect,  EthereumAuthProvider } from '@3id/connect';
// import { DID } from 'dids';
// import { TileDocument } from '@ceramicnetwork/stream-tile';
// import { SyncOptions } from '@ceramicnetwork/common';
// import { StreamID } from '@ceramicnetwork/streamid';

import {Client, PrivateKey, createUserAuth, KeyInfo, UserAuth, GetThreadResponse} from '@textile/hub';
interface IMessage {
  origin: string,
  content: string,
}

interface IProfile {
  cid: string,
  avatar: string,
  name: string,
}

export class App {
  public title = 'De-scussion';
  public messages: Array<IMessage> = [];
  private message: string;
  // private profile: IProfile = {
  //   cid: 'bafybeiecxd75pet7oe5c5wlyntlvxd4awnrex6ypnlruolkl2dzgiqdjia',
  //   avatar: 'GiladTsabarWorkProfileSQ400.png',
  //   name: 'Gilad Tsabar',
  // }

  public wallet: {
    address: string,
  };

  private inputRef: HTMLTextAreaElement;
  private provider: any;

  private client: Client;
  private user: PrivateKey;
  private token: string;
  private dbs: any;
  private threads: Array<GetThreadResponse>;

  constructor() {
    this.message = "";
    this.wallet = {
      address: '',
    }

    // this.messages = [
    //   {
    //     origin: '0xd5804F7B89f26efeaB13440BA92A8AF3f5fCcE9b',
    //     content: "Hello <br>World!",
    //   },
    //   {
    //     origin: '0x21bF0f34752a35E989002c2e6A78D5Df6BC7aE6F',
    //     content: 'Hello There!',
    //   },
    // ]
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

    const userAuth = await this.auth({key: process.env.TEXTILE_KEY, secret: process.env.TEXTILE_SECRET});
    this.client = await this.setup(userAuth);
    this.user = await PrivateKey.fromRandom();
    this.token = await this.client.getToken(this.user);
    this.dbs = await this.client.newDB();
    this.threads = await this.client.listThreads();
    console.log({token: this.token, threads: this.threads[0].id, dbs: this.dbs});
    console.log({ dbs: this.dbs.TileDocument });

  }

  addMessage(): void {
    if(!this.message) return;
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

  async setup (auth: UserAuth):Promise<Client> {
    return await Client.withUserAuth(auth);
  }

  async auth (keyInfo: KeyInfo):Promise<UserAuth> {
    // Create an expiration and create a signature. 60s or less is recommended.
    const expiration = new Date(Date.now() + 60 * 1000)
    // Generate a new UserAuth
    const userAuth: UserAuth = await createUserAuth(keyInfo.key, keyInfo.secret ?? '', expiration)
    return userAuth
  }
}
