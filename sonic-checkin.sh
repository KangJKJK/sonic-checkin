#!/bin/bash

# 색깔 변수 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Sonic 데일리퀘스트 미션 스크립트를 시작합니다...${NC}"

# 작업 디렉토리 설정
workDir="/root/sonic-checkin"

# 기존 작업 디렉토리가 존재하면 삭제
if [ -d "$workDir" ]; then
    echo -e "${YELLOW}작업 디렉토리 '${workDir}'가 이미 존재하므로 삭제합니다.${NC}"
    rm -rf "$workDir"
fi

# 작업 디렉토리 새로 생성
echo -e "${YELLOW}새로운 작업 디렉토리 '${workDir}'를 생성합니다.${NC}"
mkdir -p "$workDir"
cd "$workDir"

# 파일 다운로드 및 덮어쓰기
echo -e "${YELLOW}필요한 파일들을 다운로드합니다...${NC}"

# 존재하는 파일을 삭제하고 다운로드
rm -f package.json
curl -o package.json https://raw.githubusercontent.com/KangJKJK/sonic-checkin/main/package.json

rm -f package-lock.json
curl -o package-lock.json https://raw.githubusercontent.com/KangJKJK/sonic-checkin/main/package-lock.json

# npm 설치 여부 확인
echo -e "${YELLOW}필요한 파일들을 설치합니다...${NC}"
if ! command -v npm &> /dev/null; then
    echo -e "${RED}npm이 설치되지 않았습니다. npm을 설치합니다...${NC}"
    sudo apt-get update
    sudo apt-get install -y npm
else
    echo -e "${GREEN}npm이 이미 설치되어 있습니다.${NC}"
fi

# Node.js 모듈 설치
echo -e "${YELLOW}필요한 Node.js 모듈을 설치합니다...${NC}"
npm install
npm install @solana/web3.js chalk bs58

# Node.js 스크립트 작성 (sonic-checkin.mjs)
echo -e "${YELLOW}Node.js 스크립트를 작성하고 있습니다...${NC}"
cat << 'EOF' > sonic-checkin.mjs
import fs from 'fs';
import path from 'path';
import prompts from 'prompts';
import * as sol from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import fetch from 'node-fetch';

// 작업 디렉토리 설정
const workDir = '/root/sonic-checkin';
if (!fs.existsSync(workDir)) {
    fs.mkdirSync(workDir, { recursive: true });
}
process.chdir(workDir);

(async () => {
    // 사용자로부터 개인키 입력받기 (콤마로 구분)
    const response = await prompts({
        type: 'text',
        name: 'privateKeys',
        message: '콤마로 구분된 개인키를 입력하세요 (여러 개인키 입력 가능). 입력 후 Enter를 누르세요:',
        validate: value => value.trim().length > 0 ? true : '개인키를 입력해 주세요.'
    });

    // 개인키 파일로 저장
    const privateKeyFile = path.join(workDir, 'sonicprivate.txt');
    fs.writeFileSync(privateKeyFile, response.privateKeys.trim());

    // 환경 변수 설정
    process.env.privatekey = response.privateKeys.trim();

    const connection = new sol.Connection('https://devnet.sonic.game/', 'confirmed');

    function getKeypairFromPrivateKey(privateKey) {
        const decoded = bs58.decode(privateKey);
        return sol.Keypair.fromSecretKey(decoded);
    }

    async function Tx(trans, keyPair) {
        try {
            const tx = await sol.sendAndConfirmTransaction(connection, trans, [keyPair]);
            console.log(`트랜잭션 URL: https://explorer.sonic.game/tx/${tx}`);
            return tx;
        } catch (error) {
            console.error('트랜잭션 처리 중 오류 발생:', error);
        }
    }

    const getSolanaBalance = (fromKeypair) => {
        return new Promise(async (resolve) => {
            try {
                const balance = await connection.getBalance(fromKeypair.publicKey);
                resolve(balance / sol.LAMPORTS_PER_SOL);
            } catch (error) {
                resolve('잔액 조회 중 오류 발생!');
            }
        });
    }

    const getDailyLogin = (keyPair, auth) => new Promise(async (resolve) => {
        try {
            const data = await fetch('https://odyssey-api.sonic.game/user/check-in/transaction', {
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
                    'Authorization': auth,
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
                        'Authorization': auth,
                        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
                    },
                    body: JSON.stringify({
                        'hash': signature
                    })
                }).then(response => response.json());
                resolve(checkin);
            } else {
                resolve(data);
            }
        } catch (error) {
            console.error('데일리 로그인 처리 중 오류 발생:', error);
        }
    });

    const getTokenLogin = (keyPair) => new Promise(async (resolve) => {
        try {
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
            const addressEncoded = Buffer.from(keyPair.publicKey.toBytes()).toString("base64");
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
                    'address': publicKey,
                    'address_encoded': addressEncoded,
                    'signature': signature
                })
            }).then(response => response.json());
            const token = authorize.data.token;
            resolve(token);
        } catch (error) {
            console.error('토큰 로그인 처리 중 오류 발생:', error);
        }
    });

    // 콤마로 구분된 개인키 목록 읽기
    const listAccounts = fs.readFileSync(path.join(workDir, 'sonicprivate.txt'), 'utf-8')
        .split(",")
        .map(a => a.trim());

    if (listAccounts.length === 0) {
        throw new Error('sonicprivate.txt에 개인키를 하나 이상 입력해주세요.');
    }

    const totalKeys = listAccounts.length;

    // 각 개인키에 대해 처리 수행
    for (let i = 0; i < totalKeys; i++) {
        const privateKey = listAccounts[i];
        const keypair = getKeypairFromPrivateKey(privateKey);
        const publicKey = keypair.publicKey.toBase58();
        const initialBalance = (await getSolanaBalance(keypair));
        console.log(`공식키: ${publicKey}`);
        console.log(`초기 잔액: ${initialBalance}`);
        const getToken = await getTokenLogin(keypair);           // 토큰 로그인 획득
        const getdaily = await getDailyLogin(keypair, getToken); // 데일리 체크인 수행
        console.log(getdaily);

        // 처리 진행 상태 출력
        const progress = ((i + 1) / totalKeys * 100).toFixed(2);
        console.log(`처리 진행 상태: ${progress}% (${i + 1}/${totalKeys})`);

        // 1초 지연
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
})();
EOF

echo -e "${YELLOW}Node.js 스크립트를 작성했습니다.${NC}"

# Node.js 스크립트 실행
echo -e "${GREEN}Node.js 스크립트를 실행합니다...${NC}"
node --no-deprecation sonic-checkin.mjs

echo -e "${GREEN}모든 작업이 완료되었습니다. 컨트롤+A+D로 스크린을 종료해주세요.${NC}"
echo -e "${GREEN}스크립트 작성자: https://t.me/kjkresearch${NC}"
