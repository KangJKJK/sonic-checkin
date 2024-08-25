import { Connection, Keypair, Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import prompts from 'prompts';
import nacl from "tweetnacl";
import fetch from "node-fetch";

// Solana Devnet RPC URL 설정
const rpc = 'https://devnet.sonic.game/';
const connection = new Connection(rpc, 'confirmed'); // Solana 네트워크와 연결 설정

// 기본 HTTP 헤더 설정
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

// 개인키 로드
const getKeypairFromPrivateKey = (privateKey) => {
    try {
        // Base58로 인코딩된 비밀 키를 디코딩합니다
        const decoded = bs58.decode(privateKey);

        // 비밀 키의 길이가 64바이트인지 확인합니다
        if (decoded.length !== 64) {
            throw new Error(`비밀 키의 길이가 올바르지 않습니다. 현재 길이: ${decoded.length}`);
        }

        // Keypair 객체를 생성합니다
        return Keypair.fromSecretKey(decoded);
    } catch (error) {
        console.error(`비밀 키 변환 오류: ${error.message}`);
        throw error;
    }
}

// 거래를 전송하는 함수
const sendTransaction = async (transaction, keyPair) => {
    try {
        transaction.partialSign(keyPair); // 거래에 서명
        const rawTransaction = transaction.serialize(); // 거래를 직렬화
        const signature = await connection.sendRawTransaction(rawTransaction); // 거래 전송
        await connection.confirmTransaction(signature); // 거래 확인
        return signature;
    } catch (error) {
        throw error;
    }
}

// 지연을 주는 함수
const delay = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

// 2Captcha Turnstile CAPTCHA를 해결하는 함수
const twocaptcha_turnstile = async (sitekey, pageurl) => {
    try {
        // CAPTCHA 토큰 요청
        const getToken = await fetch(`https://2captcha.com/in.php?key=${captchaKey}&method=turnstile&sitekey=${sitekey}&pageurl=${pageurl}&json=1`, {
            method: 'GET',
        })
        .then(res => res.text())
        .then(res => {
            if (res == 'ERROR_WRONG_USER_KEY' || res == 'ERROR_ZERO_BALANCE') {
                throw new Error(res);
            } else {
                return res.split('|');
            }
        });

        if (getToken[0] != 'OK') {
            throw new Error('FAILED_GETTING_TOKEN');
        }
    
        const task = getToken[1];

        // 토큰을 얻기 위해 주기적으로 폴링
        for (let i = 0; i < 60; i++) {
            const token = await fetch(
                `https://2captcha.com/res.php?key=${captchaKey}&action=get&id=${task}&json=1`
            ).then(res => res.json());
            
            if (token.status == 1) {
                return token;
            }
            await delay(2); // 2초 대기
        }
        throw new Error('FAILED_GETTING_TOKEN');
    } catch (error) {
        throw error;
    }
}

// 솔라나 Faucet에서 SOL을 청구하는 함수
const claimFaucet = async (address) => {
    let success = false;
    
    while (!success) {
        try {
            const bearer = await twocaptcha_turnstile('0x4AAAAAAAc6HG1RMG_8EHSC', 'https://faucet.sonic.game/#/');
            if (bearer == 'ERROR_WRONG_USER_KEY' || bearer == 'ERROR_ZERO_BALANCE' || bearer == 'FAILED_GETTING_TOKEN') {
                return `청구 실패, ${bearer}`;
            }
    
            // Faucet API를 통해 청구 요청
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
                return `성공적으로 1 SOL을 청구했습니다!`;
            }
        } catch (error) {
            return `청구 실패, ${error}`;
        }
    }
}

// 로그인 토큰을 가져오는 함수
const getLoginToken = async (keyPair) => {
    while (true) {
        try {
            // 로그인 도전 과제 요청
            const message = await fetch(`https://odyssey-api.sonic.game/auth/sonic/challenge?wallet=${keyPair.publicKey}`, {
                headers: defaultHeaders
            }).then(res => res.json());
        
            const sign = nacl.sign.detached(Buffer.from(message.data), keyPair.secretKey); // 메시지에 서명
            const signature = Buffer.from(sign).toString('base64');
            const publicKey = keyPair.publicKey.toBase58();
            const addressEncoded = Buffer.from(keyPair.publicKey.toBytes()).toString("base64");
            // 인증 요청
            const authorize = await fetch('https://odyssey-api.sonic.game/auth/sonic/authorize', {
                method: 'POST',
                headers: defaultHeaders,
                body: JSON.stringify({
                    'address': `${publicKey}`,
                    'address_encoded': `${addressEncoded}`,
                    'signature': `${signature}`
                })
            }).then(res => res.json());
        
            return authorize.data.token;
        } catch (e) {
            // 오류 발생 시 재시도
        }
    }
}

// 매일 체크인하는 함수
const dailyCheckin = async (keyPair, auth) => {
    while (true) {
        try {
            // 체크인 상태 요청
            const data = await fetch(`https://odyssey-api.sonic.game/user/check-in/transaction`, {
                headers: {
                    ...defaultHeaders,
                    'authorization': `${auth}`
                }
            }).then(res => res.json());
            
            if (data.message == 'current account already checked in') {
                return '오늘 이미 체크인했습니다!';
            }
            
            if (data.data) {
                const transactionBuffer = Buffer.from(data.data.hash, "base64");
                const transaction = Transaction.from(transactionBuffer);
                const signature = await sendTransaction(transaction, keyPair); // 거래 전송
                // 체크인 완료 요청
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
                
                return `성공적으로 체크인 완료, ${checkin.data.accumulative_days}일째!`;
            }
        } catch (e) {
            // 오류 발생 시 재시도
        }
    }
}

// 일일 마일스톤 보상을 청구하는 함수
const claimDailyMilestone = async (auth) => {
    while (true) {
        try {
            const res = await fetch('https://odyssey-api.sonic.game/user/daily-milestone', {
                headers: {
                    ...defaultHeaders,
                    'authorization': `${auth}`
                }
            }).then(res => res.json());
            
            if (res.status === 'ok') {
                return '성공적으로 일일 마일스톤 보상을 청구했습니다!';
            }
        } catch (e) {
            // 오류 발생 시 재시도
        }
    }
}

// 사용자에게 비밀 키를 입력받기
const main = async () => {
    try {
        // 비밀 키 입력받기
        const response = await prompts({
            type: 'text',
            name: 'privateKey',
            message: '비밀 키를 입력하세요 (Base58로 인코딩된 64바이트 키):'
        });

        const privateKey = response.privateKey;
        if (!privateKey) {
            console.error('비밀 키가 입력되지 않았습니다.');
            return;
        }

        const keyPair = getKeypairFromPrivateKey(privateKey);
        const authToken = await getLoginToken(keyPair); // 로그인 토큰 가져오기
        
        // 필요한 작업 수행
        console.log(await claimFaucet(keyPair.publicKey.toBase58()));
        console.log(await dailyCheckin(keyPair, authToken));
        console.log(await claimDailyMilestone(authToken));

    } catch (error) {
        console.error(`오류 발생: ${error.message}`);
    }
}
