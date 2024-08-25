#!/bin/sh

const fs = require('fs');
const path = require('path');
const prompts = require('prompts');
const sol = require("@solana/web3.js");
const bs58 = require("bs58");
const nacl = require("tweetnacl");

// 작업 디렉토리 설정
const workDir = '/root/sonic-daily';
if (!fs.existsSync(workDir)) {
    fs.mkdirSync(workDir, { recursive: true });
}
process.chdir(workDir);

(async () => {
    // 사용자로부터 개인키 입력받기
    const response = await prompts({
        type: 'text',
        name: 'privateKey',
        message: 'Enter your private key (one per line). Press Enter when done:',
        multiline: true
    });

    // 개인키 파일로 저장
    const privateKeyFile = path.join(workDir, 'sonicprivate.txt');
    writeFileSync(privateKeyFile, response.privateKey.trim());

    // 환경 변수 설정
    process.env.privatekey = response.privateKey.trim();

    const connection = new sol.Connection('https://devnet.sonic.game/', 'confirmed');

    function getKeypairFromPrivateKey(privateKey) {
        const decoded = bs58.decode(privateKey);
        return sol.Keypair.fromSecretKey(decoded);
    }

    async function Tx(trans, keyPair) {
        const tx = await sol.sendAndConfirmTransaction(connection, trans, [
            keyPair,
        ]);
        console.log(`Tx Url: https://explorer.sonic.game/tx/${tx}`);
        return tx;
    }

    const getSolanaBalance = (fromKeypair) => {
        return new Promise(async (resolve) => {
            try {
                const balance = await connection.getBalance(fromKeypair.publicKey);
                resolve(balance / sol.LAMPORTS_PER_SOL);
            } catch (error) {
                resolve('Error getting balance!');
            }
        });
    }

    const getDailyLogin = (keyPair, auth) => new Promise(async (resolve, reject) => {
        const data = await fetch(`https://odyssey-api.sonic.game/user/check-in/transaction`, {
            headers: {
                'accept': '*/*',
                'accept-language': 'en-US,en;q=0.6',
                'if-none-match': 'W/"192-D/PuxxsvlPPenys+YyKzNiw6SKg"',
                'origin': 'https://odyssey.sonic.game',
                'priority': 'u=1, i',
                'referer': 'https://odyssey.sonic.game/',
                'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Brave";v="126"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-site',
                'sec-gpc': '1',
                'Authorization': `${auth}`,
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
            }
        }).then(response => response.json());
        if (data.data) {
            const transactionBuffer = Buffer.from(data.data.hash, "base64");
            const transaction = sol.Transaction.from(transactionBuffer);
            const signature = await Tx(transaction, keyPair);
            const checkin = await fetch('https://odyssey-api.sonic.game/user/check-in', {
                method: 'POST',
                headers: {
                    'accept': '*/*',
                    'accept-language': 'en-US,en;q=0.6',
                    'content-type': 'application/json',
                    'origin': 'https://odyssey.sonic.game',
                    'priority': 'u=1, i',
                    'referer': 'https://odyssey.sonic.game/',
                    'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Brave";v="126"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"Windows"',
                    'sec-fetch-dest': 'empty',
                    'sec-fetch-mode': 'cors',
                    'sec-fetch-site': 'same-site',
                    'sec-gpc': '1',
                    'Authorization': `${auth}`,
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
                },
                body: JSON.stringify({
                    'hash': `${signature}`
                })
            }).then(response => response.json());
            resolve(checkin)
        } else {
            resolve(data)
        }
    });

    const getTokenLogin = (keyPair) => new Promise(async (resolve, reject) => {
        const message = await fetch(`https://odyssey-api.sonic.game/auth/sonic/challenge?wallet=${keyPair.publicKey}`, {
            headers: {
                'accept': '*/*',
                'accept-language': 'en-US,en;q=0.6',
                'if-none-match': 'W/"192-D/PuxxsvlPPenys+YyKzNiw6SKg"',
                'origin': 'https://odyssey.sonic.game',
                'priority': 'u=1, i',
                'referer': 'https://odyssey.sonic.game/',
                'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Brave";v="126"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-site',
                'sec-gpc': '1',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
            }
        }).then(response => response.json());

        const sign = nacl.sign.detached(Buffer.from(message.data), keyPair.secretKey);
        const signature = Buffer.from(sign).toString('base64');
        const publicKey = keyPair.publicKey.toBase58();
        const addressEncoded = Buffer.from(keyPair.publicKey.toBytes()).toString("base64")
        const authorize = await fetch('https://odyssey-api.sonic.game/auth/sonic/authorize', {
            method: 'POST',
            headers: {
                'accept': '*/*',
                'accept-language': 'en-US,en;q=0.6',
                'content-type': 'application/json',
                'origin': 'https://odyssey.sonic.game',
                'priority': 'u=1, i',
                'referer': 'https://odyssey.sonic.game/',
                'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Brave";v="126"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-site',
                'sec-gpc': '1',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
            },
            body: JSON.stringify({
                'address': `${publicKey}`,
                'address_encoded': `${addressEncoded}`,
                'signature': `${signature}`
            })
        }).then(response => response.json());
        const token = authorize.data.token;
        resolve(token);
    });

    const listAccounts = readFileSync(path.join(workDir, 'sonicprivate.txt'), 'utf-8')
        .split("\n")
        .map(a => a.trim());

    if (listAccounts.length === 0) {
        throw new Error('Please fill at least 1 private key in sonicprivate.txt');
    }
    
    for (const privateKey of listAccounts) {
        const keypair = getKeypairFromPrivateKey(privateKey);
        const publicKey = keypair.publicKey.toBase58()
        const initialBalance = (await getSolanaBalance(keypair))
        console.log(publicKey)
        console.log(initialBalance)
        const getToken = await getTokenLogin(keypair)           // ini buat ngambil token login
        const getdaily = await getDailyLogin(keypair, getToken) // ini buat claim daily check-in
        console.log(getdaily)
        // const getOpenBox = await openBox(keypair, getToken)
        // console.log(getOpenBox)
    }
})();

echo -e "${YELLOW}모든 작업이 완료되었습니다. 컨트롤+A+D로 스크린을 종료해주세요.${NC}"
echo -e "${GREEN}스크립트 작성자: https://t.me/kjkresearch${NC}"
