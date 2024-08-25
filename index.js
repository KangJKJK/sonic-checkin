import { readFileSync } from "fs"; // 파일 시스템 모듈에서 읽기 기능을 가져옵니다.
import { Twisters } from "twisters"; // Twisters 모듈을 가져옵니다.
import { Connection, Keypair, SystemProgram, Transaction, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js"; // Solana 웹3 모듈을 가져옵니다.
import bs58 from "bs58"; // Base58 인코딩/디코딩을 위한 모듈을 가져옵니다.
import prompts from 'prompts'; // 사용자 입력을 받기 위한 모듈을 가져옵니다.
import nacl from "tweetnacl"; // 암호화 기능을 위한 모듈을 가져옵니다.

// Solana Devnet RPC URL 설정
const rpc = 'https://devnet.sonic.game/';
const connection = new Connection(rpc, 'confirmed'); // Solana 네트워크와 연결 설정
const keypairs = []; // 생성된 키쌍을 저장할 배열
const twisters = new Twisters(); // Twisters 인스턴스 생성

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

// 주소를 생성하는 함수
const generateRandomAddresses = (count) => {
    const addresses = [];
    for (let i = 0; i < count; i++) {
        const keypair = Keypair.generate();
        addresses.push(keypair.publicKey.toString());
    }
    return addresses;
}

// 개인 키 파일 경로
const workDir = './'; // 작업 디렉토리 경로
const privateKeyFile = path.join(workDir, 'sonicprivate.txt');

// 개인 키를 파일에서 로드하여 Keypair 객체를 생성하는 함수
const getKeypairFromPrivateKeyFile = () => {
    try {
        // 개인 키를 파일에서 읽어옵니다
        const privateKeyBase58 = readFileSync(privateKeyFile, 'utf8').trim();
        // Base58로 인코딩된 문자열을 디코딩하여 바이트 배열로 변환합니다
        const privateKeyBytes = bs58.decode(privateKeyBase58);

        // 개인 키의 길이를 확인합니다
        if (privateKeyBytes.length !== 64) {
            throw new Error('Invalid private key length. Expected 64 bytes.');
        }

        // Keypair 객체를 생성합니다
        return Keypair.fromSecretKey(privateKeyBytes);
    } catch (error) {
        console.error('Error loading Keypair from private key file:', error);
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
const dailyMilestone = async (auth, stage) => {
    while (true) {
        try {
            // 일일 거래 상태 요청
            await fetch('https://odyssey-api.sonic.game/user/transactions/state/daily', {
                method: 'GET',
                headers: {
                    ...defaultHeaders,
                    'authorization': `${auth}`
                }
            });
            
            // 마일스톤 보상 요청
            const milestone = await fetch(`https://odyssey-api.sonic.game/user/milestones/daily/${stage}`, {
                method: 'POST',
                headers: {
                    ...defaultHeaders,
                    'authorization': `${auth}`
                }
            }).then(res => res.json());
            
            if (milestone.data) {
                return `성공적으로 마일스톤 ${stage} 보상을 청구했습니다!`;
            }
        } catch (e) {
            // 오류 발생 시 재시도
        }
    }
}

// 미스터리 박스를 여는 함수
const openBox = async (keyPair, auth) => {
    while (true) {
        try {
            // 미스터리 박스 상태 요청
            const data = await fetch(`https://odyssey-api.sonic.game/user/rewards/mystery-box`, {
                headers: {
                    ...defaultHeaders,
                    'authorization': `${auth}`
                }
            }).then(res => res.json());
            
            if (data.message == 'already opened') {
                return '이미 박스를 열었습니다!';
            }
            
            if (data.data) {
                const transactionBuffer = Buffer.from(data.data.hash, "base64");
                const transaction = Transaction.from(transactionBuffer);
                const signature = await sendTransaction(transaction, keyPair); // 거래 전송
                // 박스 열기 요청
                const open = await fetch('https://odyssey-api.sonic.game/user/rewards/mystery-box/open', {
                    method: 'POST',
                    headers: {
                        ...defaultHeaders,
                        'authorization': auth
                    },
                    body: JSON.stringify({
                        'hash': `${signature}`
                    })
                }).then(res => res.json());
                
                return `성공적으로 박스를 열었습니다, ${open.data}!`;
            }
        } catch (e) {
            // 오류 발생 시 재시도
        }
    }
}

// 모든 기능을 실행하는 함수
const claimAirdrop = async (keyPair) => {
    const auth = await getLoginToken(keyPair); // 로그인 토큰 획득
    const result = {
        faucet: await claimFaucet(keyPair.publicKey.toString()), // Faucet에서 SOL 청구
        checkin: await dailyCheckin(keyPair, auth), // 매일 체크인
        milestone1: await dailyMilestone(auth, 1), // 마일스톤 1 청구
        milestone2: await dailyMilestone(auth, 2), // 마일스톤 2 청구
        milestone3: await dailyMilestone(auth, 3), // 마일스톤 3 청구
        openBox: await openBox(keyPair, auth), // 미스터리 박스 열기
    };
    return result;
}

// 메인 함수
const main = async () => {
    const count = 1; // 생성할 주소의 수
    const addresses = generateRandomAddresses(count); // 랜덤 주소 생성

    for (const address of addresses) {
        const keyPair = getKeypairFromPrivateKey(address); // 개인 키를 통해 Keypair 생성
        keypairs.push(keyPair); // 배열에 추가
    }

    for (const keyPair of keypairs) {
        const result = await claimAirdrop(keyPair); // 에어드랍 청구
        console.log(`주소 ${keyPair.publicKey.toBase58()}의 결과:`, result); // 결과 출력
    }
}

main().catch(console.error); // 메인 함수 실행 및 에러 출력
