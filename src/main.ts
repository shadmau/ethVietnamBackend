import { ethers } from "ethers";
import dotenv from "dotenv"
const unidici = require("undici");
import { sleep, yellowLog, redLog, greenLog, blueLog } from "./utils";


async function getBTCPriceBitfinex(): Promise<ethers.BigNumber | null> {
    const url = "https://api-pub.bitfinex.com/v2/tickers?symbols=tBTCUSD"

    let result = await unidici.request(url, { headers: { 'content-type': 'application/json' } });
    if (result.statusCode == 200) {
        const priceArr = await result.body.json();
        return ethers.utils.parseEther(priceArr[0][7].toString());

    } else {
        console.log("Bitfinex Request faild");
        return null;
    }

}

const FACTORYABI = require('./factory.abi')
const VAULTABI = require('./vault.abi')

const path = require('path')

let wsProvider: ethers.providers.WebSocketProvider;
const _path = '../.env'

dotenv.config({ path: path.resolve(_path) })
if (process.env['EXECUTER_PW'] == undefined || process.env['GETH_WS'] === undefined) { throw Error("Dotenv configuration wrong!") }
wsProvider = new ethers.providers.WebSocketProvider(process.env['GETH_WS']);
const executerWallet = new ethers.Wallet(process.env['EXECUTER_PW'], wsProvider);
const FACTORY_ADDRESS = "0x5E4c483d580cD024FF82ae63D9F4c18d7215A774"
let lastBlock = 29316155;
let blockedForMs = 300000
let blockList: Array<BlockedUser> = []
interface BlockedUser {
    userWallet: string,
    blockedUntil: number
    ruleID: number
}

interface Rule {
    id: number;
    amount: ethers.BigNumber;
    btcPriceOffchain: ethers.BigNumber;
    excTime: number;
    maxExecution: number;
    currentExecution: number;
    timeinterval: number;
    exchange: Exchange,
    action: Action,
    active: Boolean
    needsToBeLower: Boolean

}
enum Action {
    exchange,
    payment

}

enum Exchange {
    quickswap
}

interface User {
    walletAddress: string,
    vaultAddress: string,
    rules?: Array<Rule>
}

let users: Array<User> = []
const factoryContract = new ethers.Contract(FACTORY_ADDRESS, FACTORYABI, wsProvider);
let newVaultFilter = factoryContract.filters['vaultCreated'];

async function getNewVault(fromBlock: number, toBlock: number) {
    const fnct = "MAIN.getNewVault"
    if (newVaultFilter === undefined) { throw Error("Filter not found!") }
    const events = await factoryContract.queryFilter(newVaultFilter(), fromBlock, toBlock)
    for (const event of events) {
        blueLog("New Vaults created between Block " + fromBlock + " to " + toBlock + ": " + events.length, fnct)
        let userAlreadyExists: Boolean = false;
        for (const user of users) {
            if (event.args === undefined || event.args['creator'] === undefined) { continue; }
            if (user.walletAddress.toUpperCase() == event.args['creator'].toUpperCase()) { userAlreadyExists = true; }
        }
        if (!userAlreadyExists && event.args != undefined && event.args['creator'] != undefined) {
            users.push({ walletAddress: event.args['creator'], vaultAddress: event.args['newVault'] });
            greenLog("New User added: " + event.args['creator'] + " Vault: " + event.args['newVault'], fnct)
        }
    }
}

async function updateRulesForUsers() {
    const fnct = "Main.updateRulesForUsers"
    let tmp_userList: Array<User> = []
    for (const user of users) {
        if (user.vaultAddress == undefined) {
            throw Error("User Vault not found!")
        }
        const vaultContract = new ethers.Contract(user.vaultAddress, VAULTABI, wsProvider);

        const currentNumberOfRules = await vaultContract['numOfRules']();
        let userRulesAmount = 0;
        if (user.rules !== undefined) {
            if (currentNumberOfRules.eq(user.rules.length)) {
                tmp_userList.push(user)
                greenLog("No new rule for user! Continue.", fnct)
                continue;
            } else {
                userRulesAmount = user.rules.length;
            }
        }

        yellowLog("New Rules for user " + user.walletAddress + " : " + currentNumberOfRules.sub(userRulesAmount), fnct )

        let _rules: Array<Rule> = []
        for (let i = 0; i < currentNumberOfRules; i++) {
            const result = await vaultContract['rules'](i);
            const _amount: ethers.BigNumber = ethers.BigNumber.from(result.amount);
            const _excTime: number = result.excTime;
            const _maxExecution: number = result.maxExecution;
            const _currentExecution: number = result.currentExecution;
            const _timeinterval: number = result.timeinterval;
            const _exchange: Exchange = Exchange.quickswap
            const _active: Boolean = result.active
            const _btcPriceOffchain: ethers.BigNumber = result.btcPriceOffchain
            const _needsToBeLower: Boolean = result.needsToBeLower
            let _action: Action;
            if (result.action == 0) {
                _action = Action.exchange
            } else {
                _action = Action.payment

            }
            const rule: Rule = { id: i, btcPriceOffchain: _btcPriceOffchain, needsToBeLower: _needsToBeLower, action: _action, amount: _amount, excTime: _excTime, maxExecution: _maxExecution, currentExecution: _currentExecution, timeinterval: _timeinterval, exchange: _exchange, active: _active };


            _rules.push(rule)
        }

        tmp_userList.push({ walletAddress: user.walletAddress, vaultAddress: user.vaultAddress, rules: _rules })
    }
    users = tmp_userList;


}
async function match() {
    const fnct = "MAIN.match"
    const currentBlockNumber = await wsProvider.getBlockNumber()
    const block = await wsProvider.getBlock(currentBlockNumber)
    const blockTimestamp = block.timestamp;
    const currentPrice: ethers.BigNumber | null = await getBTCPriceBitfinex();
    if (currentPrice == null) { redLog("Couldnt fetch price. No matching", fnct); return; }

    for (const user of users) {
        const rules: Array<Rule> | undefined = user.rules
        if (rules == undefined) { continue; }
        for (const rule of rules) {
            blueLog("Checking Rule " + rule.id + " of user " + user.walletAddress, fnct);
            if (isUserBlocked(user.walletAddress, rule.id)) { redLog("Rule " + rule.id + " of user " + user.walletAddress + " still executing", fnct); continue; } //todo: Add ruleid
            if (rule.active == false) { yellowLog("Rule not active", fnct); continue; }
            if (rule.currentExecution >= rule.maxExecution) { yellowLog("Max Exc reached", fnct); continue; }
            if (rule.excTime > blockTimestamp) { yellowLog("Execution time not reached yet. Still need " + (rule.excTime - blockTimestamp) + " ms", fnct); continue; }
            if ((rule.needsToBeLower == true && currentPrice.lt(rule.btcPriceOffchain)) || (rule.needsToBeLower == false && currentPrice.gt(rule.btcPriceOffchain))) {
                execTransaction(user, rule.id);
            } else {
                greenLog("Price not reached", fnct);
            }

        }

    }
}

async function execTransaction(user: User, ruleID: number) {
    const fnct = "MAIN.execTransaction"
    yellowLog("Executing Rule " + ruleID + " of User" + user.walletAddress + " (Vault: " + user.vaultAddress + ")", fnct);
    yellowLog("Adding to blacklist", fnct)
    addUserToBlockList(user.walletAddress, ruleID) //todo: Add ruleid

    blueLog("Sending execution tx for user " + user.walletAddress + " to vault " + user.vaultAddress + " for Rule " + ruleID, fnct);
    const vaultContract = new ethers.Contract(user.vaultAddress, VAULTABI, executerWallet);
    const result = await vaultContract['execRule'](ruleID, {type:0, gasPrice: 300000000000});
    greenLog("Transaction sent", fnct)
    console.log(result)
}


function addUserToBlockList(_userWallet: string, ruleID: number) {
    blockList.push({ userWallet: _userWallet, blockedUntil: Date.now() + blockedForMs, ruleID })
}

//todo: Add user removal from Blocklist
function isUserBlocked(_userWallet: string, ruleID: number) {
    for (const blockedUser of blockList) {
        if (blockedUser.userWallet.toUpperCase() == _userWallet.toUpperCase() && blockedUser.blockedUntil > Date.now() && blockedUser.ruleID == ruleID) {
            return true;
        }
    }
    return false;
}


async function main() {
    let iteration:number = 0;
    const fnct = "MAIN.main"
    while (true) {
        yellowLog("Iteration: " + iteration + "\r\n-------------", fnct)
        //Get All vaults
        const currentBlock = await wsProvider.getBlockNumber()
        await getNewVault(lastBlock, currentBlock)
        lastBlock = currentBlock

        //Update all rules for all vaults
        await updateRulesForUsers()
        //Check if matching
        await match()
        await sleep(3000);
        iteration++;
    }



}
main()


