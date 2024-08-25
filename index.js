import { readFileSync } from 'fs';
import { Twisters } from 'twisters';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import prompts from 'prompts';
import nacl from 'tweetnacl';
import fetch from 'node-fetch';

const captchaKey = 'INSERT_YOUR_2CAPTCHA_KEY_HERE';
const rpc = 'https://devnet.sonic.game/';
const connection = new Connection(rpc, 'confirmed');
const keypairs = [];
const twisters = new Twisters();

const defaultHeaders = {
    'accept': '*/*',
    'accept-language': 'en-US,en;q=0.7',
    'content-type': 'application/json',
    'priority': 'u=1, i',
    'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Brave";v="126"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    'sec-gpc': '1',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
};

const generateRandomAddresses = (count) => {
    const addresses = [];
    for (let i = 0; i < count; i++) {
        const keypair = Keypair.generate();
        addresses.push(keypair.publicKey.toString());
    }
    return addresses;
};

const getKeypairFromPrivateKey = (privateKey) => {
    const decoded = bs58.decode(privateKey);
    return Keypair.fromSecretKey(decoded);
};

const sendTransaction = async (transaction, keyPair) => {
    try {
        transaction.partialSign(keyPair);
        const rawTransaction = transaction.serialize();
        const signature = await connection.sendRawTransaction(rawTransaction);
        await connection.confirmTransaction(signature);
        return signature;
    } catch (error) {
        return error;
    }
};

const delay = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

const twocaptcha_turnstile = async (sitekey, pageurl) => {
    try {
        const getToken = await fetch(`https://2captcha.com/in.php?key=${captchaKey}&method=turnstile&sitekey=${sitekey}&pageurl=${pageurl}&json=1`)
            .then(res => res.text())
            .then(res => {
                if (res == 'ERROR_WRONG_USER_KEY' || res == 'ERROR_ZERO_BALANCE') {
                    return res;
                } else {
                    return res.split('|');
                }
            });

        if (getToken[0] != 'OK') {
            return 'FAILED_GETTING_TOKEN';
        }
    
        const task = getToken[1];

        for (let i = 0; i < 60; i++) {
            const token = await fetch(`https://2captcha.com/res.php?key=${captchaKey}&action=get&id=${task}&json=1`)
                .then(res => res.json());
            
            if (token.status == 1) {
                return token;
            }
            await delay(2);
        }
    } catch (error) {
        return 'FAILED_GETTING_TOKEN';
    }
};

const claimFaucet = async (address) => {
    let success = false;

    while (!success) {
        const bearer = await twocaptcha_turnstile('0x4AAAAAAAc6HG1RMG_8EHSC', 'https://faucet.sonic.game/#/');
        if (bearer == 'ERROR_WRONG_USER_KEY' || bearer == 'ERROR_ZERO_BALANCE' || bearer == 'FAILED_GETTING_TOKEN') {
            success = true;
            return `Failed claim, ${bearer}`;
        }

        try {
            const res = await fetch(`https://faucet-api.sonic.game/airdrop/${address}/1/${bearer.request}`, {
                headers: {
                    "Accept": "application/json, text/plain, */*",
                    "Content-Type": "application/json",
                    "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
                    "Dnt": "1",
                    "Origin": "https://faucet.sonic.game",
                    "Priority": "u=1, i",
                    "Referer": "https://faucet.sonic.game/",
                    "User-Agent": bearer.useragent,
                    "sec-ch-ua-mobile": "?0",
                    "sec-ch-ua-platform": "Windows",
                }
            }).then(res => res.json());

            if (res.status == 'ok') {
                success = true;
                return `Successfully claim faucet 1 SOL!`;
            }
        } catch (error) {
            // Handle error if necessary
        }
    }
};

const getLoginToken = async (keyPair) => {
    let success = false;
    while (!success) {
        try {
            const message = await fetch(`https://odyssey-api.sonic.game/auth/sonic/challenge?wallet=${keyPair.publicKey}`, {
                headers: defaultHeaders
            }).then(res => res.json());

            const sign = nacl.sign.detached(Buffer.from(message.data), keyPair.secretKey);
            const signature = Buffer.from(sign).toString('base64');
            const publicKey = keyPair.publicKey.toBase58();
            const addressEncoded = Buffer.from(keyPair.publicKey.toBytes()).toString("base64");
            const authorize = await fetch('https://odyssey-api.sonic.game/auth/sonic/authorize', {
                method: 'POST',
                headers: defaultHeaders,
                body: JSON.stringify({
                    'address': `${publicKey}`,
                    'address_encoded': `${addressEncoded}`,
                    'signature': `${signature}`
                })
            }).then(res => res.json());

            const token = authorize.data.token;
            success = true;
            return token;
        } catch (e) {
            // Handle error if necessary
        }
    }
};

const dailyCheckin = async (keyPair, auth) => {
    let success = false;
    while (!success) {
        try {
            const data = await fetch(`https://odyssey-api.sonic.game/user/check-in/transaction`, {
                headers: {
                    ...defaultHeaders,
                    'authorization': `${auth}`
                }
            }).then(res => res.json());

            if (data.message == 'current account already checked in') {
                success = true;
                return 'Already check in today!';
            }

            if (data.data) {
                const transactionBuffer = Buffer.from(data.data.hash, "base64");
                const transaction = Transaction.from(transactionBuffer);
                const signature = await sendTransaction(transaction, keyPair);
                const checkin = await fetch('https://odyssey-api.sonic.game/user/check-in', {
                    method: 'POST',
                    headers: {
                        ...defaultHeaders,
                        'authorization': `${auth}`
                    },
                    body: JSON.stringify({
                        'hash': `${signature}`
                    })
                }).then(res => res.json());

                success = true;
                return `Successfully to check in, day ${checkin.data.accumulative_days}!`;
            }
        } catch (e) {
            // Handle error if necessary
        }
    }
};

const dailyMilestone = async (auth, stage) => {
    let success = false;
    while (!success) {
        try {
            await fetch('https://odyssey-api.sonic.game/user/transactions/state/daily', {
                method: 'GET',
                headers: {
                    ...defaultHeaders,
                    'authorization': `${auth}`
                }
            });

            const data = await fetch('https://odyssey-api.sonic.game/user/transactions/rewards/claim', {
                method: 'POST',
                headers: {
                    ...defaultHeaders,
                    'authorization': `${auth}`
                },
                body: JSON.stringify({
                    'stage': stage
                })
            }).then(res => res.json());

            if (data.message == 'interact rewards already claimed') {
                success = true;
                return `Already claim milestone ${stage}!`;
            }

            if (data.data) {
                success = true;
                return `Successfully to claim milestone ${stage}.`
            }
        } catch (e) {
            // Handle error if necessary
        }
    }
};

const openBox = async (keyPair, auth) => {
    let success = false;
    while (!success) {
        try {
            const data = await fetch(`https://odyssey-api.sonic.game/user/rewards/mystery-box/build-tx`, {
                headers: {
                    ...defaultHeaders,
                    'authorization': auth
                }
            }).then(res => res.json());

            if (data.data) {
                const transactionBuffer = Buffer.from(data.data.hash, "base64");
                const transaction = Transaction.from(transactionBuffer);
                transaction.partialSign(keyPair);
                const signature = await sendTransaction(transaction, keyPair);
                const open = await fetch('https://odyssey-api.sonic.game/user/rewards/mystery-box/open', {
                    method: 'POST',
                    headers: {
                        ...defaultHeaders,
                        'authorization': auth
                    },
                    body: JSON.stringify({
                        'hash': signature
                    })
                }).then(res => res.json());

                success = true;
                return `Successfully to open box, ${open.data.reward}!`;
            }
        } catch (e) {
            // Handle error if necessary
        }
    }
};

const main = async () => {
    const addresses = generateRandomAddresses(10);

    for (const address of addresses) {
        console.log(`Processing address: ${address}`);

        const keyPair = getKeypairFromPrivateKey(address);
        const auth = await getLoginToken(keyPair);

        console.log(await claimFaucet(address));
        console.log(await dailyCheckin(keyPair, auth));
        console.log(await dailyMilestone(auth, 3));
        console.log(await openBox(keyPair, auth));
    }
};

main();
