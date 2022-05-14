import { autoinject } from "aurelia-framework";
import axios from 'axios';
import { ethers,  } from 'ethers';
import { Ethereumish } from 'resources/web3types';

declare global {
  interface Window {
    ethereum: Ethereumish;
  }
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

interface IWallet {
  address: string,
}

@autoinject
export class Auth {
  public wallet: IWallet;
  public provider: ethers.providers.Web3Provider;
  public chainId: string | number;
  public isConnected = false;

  public async init(): Promise<void> {
    const { ethereum } = window;
    this.chainId = 1; // Set default chainId to 1 for mainnet, in case there is no provider injected to the dom.
    if (!ethereum) return;

    this.provider = new ethers.providers.Web3Provider(ethereum, 'any');
    this.chainId = await this.provider.getNetwork().then(network => network.chainId);
    const accounts = await this.provider.listAccounts();

    this.isConnected = accounts.length > 0;
    if(accounts.length > 0) this.wallet = { address: accounts[0] };

    if (ethereum) {
      // Listen to network changes and reload the page
      ethereum.on("chainChanged", (networkId) => {
        window.location.reload();
      });

      // Listen to account changes and update the wallet
      ethereum.on('accountsChanged', function (accounts) {
        window.location.reload();
      })
    }
  }

  public async isValidAuth(): Promise<string> {
    const signature = localStorage.getItem('signature');
    if(!signature) return '';

    return await axios.post(
      `https://theconvo.space/api/validateAuth?apikey=${ process.env.CONVO_API_KEY }`,
      {
        "signerAddress": this.wallet.address,
        "token": JSON.parse(signature).message
      },
    ).then(res => {
      if(res.data.success) {
        return res.data.message;
      }
    }).catch(err => {
      console.error(err.message)
      return '';
    });
  }

  public async signThread():Promise<{success: boolean, message: string}> {
    const validation = await this.isValidAuth()

    if(!validation) {
      // Sample signature generation code using ethers.js
      const timestamp = Date.now();
      const signer = await this.provider.getSigner();
      const signerAddress = await signer.getAddress();
      const chain = "ethereum";
      const data = `I allow this site to access my data on The Convo Space using the account ${signerAddress}. Timestamp:${timestamp}`;

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
            chain,
          }
        ));

        if(auth.data.success){
          localStorage.setItem('signature', JSON.stringify(auth.data));
        }
      } catch (e) {
        if(localStorage.getItem('signature')) {
          localStorage.removeItem('signature');
        }
        console.log('User denied signature:', e);
      }

    }

    return JSON.parse(localStorage.getItem('signature'));
  }

  // User pressed the "Connect to wallet" button
  public async connect():Promise<void> {
    const { ethereum } = window;
    this.provider = await new ethers.providers.Web3Provider(ethereum, 'any');
    const accounts = await this.provider.listAccounts();

    if(!accounts.length) {
      await this.provider.send("eth_requestAccounts", []);
    }
    if(accounts.length) {
      this.wallet = {
        address: accounts[0]
      }
      this.isConnected = true;
    } else {
      this.wallet = {
        address: '',
      }
      this.isConnected = false;
    }
  }

  async isMetaMaskConnected():Promise<void> {
    const accounts = await this.provider.listAccounts();
    this.isConnected = accounts.length > 0;
  }

}
