#!/bin/bash

# 컬러 정의
export RED='\033[0;31m'
export GREEN='\033[0;32m'
export YELLOW='\033[1;33m'
export BOLD_BLUE='\033[1;34m'
export NC='\033[0m'  # No Color

# 사전안내
echo -e "${RED}트잭봇은 필수로 버너지갑을 이용하세요${NC}"

# 설치할 Node.js 버전 설정 (예: 18.x LTS)
NODE_VERSION="18.x"

if ! command -v node &> /dev/null
then
    echo -e "${BOLD_BLUE}Node.js가 설치되지 않았습니다. Node.js ${NODE_VERSION}를 설치합니다...${NC}"
    echo
    curl -sL https://deb.nodesource.com/setup_${NODE_VERSION} | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo -e "${BOLD_BLUE}Node.js가 이미 설치되어 있습니다.${NC}"
fi
echo
if ! command -v npm &> /dev/null
then
    echo -e "${BOLD_BLUE}npm이 설치되지 않았습니다. npm을 설치합니다...${NC}"
    echo
    sudo apt-get install -y npm
else
    echo -e "${BOLD_BLUE}npm이 이미 설치되어 있습니다.${NC}"
fi
echo
echo -e "${BOLD_BLUE}프로젝트 디렉토리를 생성하고 해당 디렉토리로 이동합니다.${NC}"
mkdir -p SonicBatchTx
cd SonicBatchTx
echo
echo -e "${BOLD_BLUE}새로운 Node.js 프로젝트를 초기화합니다.${NC}"
echo
npm init -y
echo
echo -e "${BOLD_BLUE}필요한 패키지를 설치합니다.${NC}"
echo
npm install @solana/web3.js chalk bs58
echo
echo -e "${BOLD_BLUE}개인키를 입력해야합니다.${NC}"
echo
read -p "Solana 월렛의 개인키를 입력하세요. 버너지갑을 사용하세요.: " privkey
echo
echo -e "${BOLD_BLUE}Node.js 스크립트 파일을 생성합니다.${NC}"
echo
cat << EOF > kjk.mjs
import {
    Connection,
    Keypair,
    SystemProgram,
    Transaction,
    sendAndConfirmTransaction,
    ComputeBudgetProgram,
    LAMPORTS_PER_SOL,
    PublicKey
} from "@solana/web3.js";
import bs58 from "bs58";

// Devnet RPC URL 설정
const connection = new Connection("https://devnet.sonic.game", 'confirmed');

// 개인 키 입력
const privkey = "$privkey"; // 개인 키를 여기에 입력하세요
const from = Keypair.fromSecretKey(bs58.decode(privkey));

// 수신자 주소를 하드코딩된 주소로 설정
const toPubkey = new PublicKey("7cb7ATwM9hsEav7yKsbZU8vVqU37VJSFnmyDJXKQEwkV");

async function sendTransaction(wallet) {
    const tx = new Transaction();

    // Compute Budget: SetComputeUnitPrice
    tx.add(
        ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: 50000 // 가격 설정
        })
    );

    // System Program: Transfer
    tx.add(
        SystemProgram.transfer({
            fromPubkey: from.publicKey,
            toPubkey: toPubkey,
            lamports: 0 // 전송할 SOL 수 (0 SOL)
        })
    );

    // Compute Budget: SetComputeUnitLimit
    tx.add(
        ComputeBudgetProgram.setComputeUnitLimit({
            units: 1400000 // 한도 설정
        })
    );

    try {
        const signature = await sendAndConfirmTransaction(connection, tx, [wallet]);
        console.log('Tx hash:', signature);
    } catch (error) {
        console.error('Transaction failed:', error.message);
        if (error.transactionLogs) {
            console.error('Transaction logs:', error.transactionLogs);
        }
    }
}

(async () => {
    await sendTransaction(from);
})();
EOF
echo
echo -e "${BOLD_BLUE}Node.js 스크립트를 실행합니다.${NC}"
node kjk.mjs
echo
echo -e "${YELLOW}모든 작업이 완료되었습니다. 컨트롤+A+D로 스크린을 종료해주세요.${NC}"
echo -e "${GREEN}스크립트 작성자: https://t.me/kjkresearch${NC}"
