import { ethers } from "ethers";
import dotenv from "dotenv"
//import {getBTCPriceBitfinex} from "./BTC_BitfinexOracle"

const FACTORYABI = require('./factory.abi')
const VAULTABI = require('./vault.abi')

const path = require('path')

let wsProvider: ethers.providers.WebSocketProvider;
const _path = '../.env'

dotenv.config({ path: path.resolve(_path) })
if (process.env['GETH_WS'] === undefined) { throw Error("Dotenv configuration wrong!") }
wsProvider = new ethers.providers.WebSocketProvider(process.env['GETH_WS']);
const FACTORY_ADDRESS = "0x7c1F44f3e2365f38f72eC3D0B9909b20f28a8B58"
let lastBlock = 29316155;
let blockedForMs = 30000
let blockList:Array<BlockedUser> = []
interface BlockedUser{
    userWallet:string,
    blockedUntil:number
}

interface Rule {
    id:number;
    amount:ethers.BigNumber;
    btcPrice:ethers.BigNumber;
    excTime: number;
    maxExecution: number;
    currentExecution: number;
    timeinterval:number;
    exchange: Exchange,
    action: Action,
    active: Boolean

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

let users:Array<User> = []
const factoryContract = new ethers.Contract(FACTORY_ADDRESS, FACTORYABI, wsProvider);
let newVaultFilter = factoryContract.filters['vaultCreated'];

async function getNewVault(fromBlock:number, toBlock:number){
    if (newVaultFilter === undefined) { throw Error("Filter not found!") }
    const events = await factoryContract.queryFilter(newVaultFilter(), fromBlock, toBlock)
    for(const event of events){
        console.log("New Vaults created between Block "+ fromBlock + " to " + toBlock + ": " + events.length)
        let userAlreadyExists:Boolean = false;
        for(const user of users){
            if(event.args === undefined ||  event.args['creator'] === undefined){continue;}
            if(user.walletAddress.toUpperCase() == event.args['creator'].toUpperCase()){userAlreadyExists = true;}
        }
        if(!userAlreadyExists && event.args != undefined && event.args['creator'] != undefined ){
            users.push({walletAddress: event.args['creator'], vaultAddress:event.args['newVault'] });
            console.log("New User added: " + event.args['creator'] + " Vault: " + event.args['newVault'])
        } 
    }
}

async function updateRulesForUsers(){
    let tmp_userList:Array<User> = []
    for(const user of users){
        if(user.vaultAddress == undefined){
            throw Error("User Vault not found!") 
        }
        const vaultContract = new ethers.Contract(user.vaultAddress, VAULTABI, wsProvider);
       
        const currentNumberOfRules = await vaultContract['numOfRules']();
        let _rules:Array<Rule> =[]
        for(let i=0; i<currentNumberOfRules; i++){
            const result = await vaultContract['rules'](i);
            const _amount:ethers.BigNumber = ethers.BigNumber.from(result.amount);
            const _excTime:number = result.excTime;
            const _maxExecution:number = result.maxExecution;
            const _currentExecution:number = result.currentExecution;
            const _timeinterval:number = result.timeinterval;
            const _exchange:Exchange = Exchange.quickswap
            const _active:Boolean = result.action
            const _btcPrice:ethers.BigNumber = result.btcPrice
            let _action:Action;
            if(result.action == 0){
                _action = Action.exchange
            } else {
                _action = Action.payment

            }
           const rule:Rule =  {id:i, btcPrice:_btcPrice, action:_action, amount:_amount, excTime:_excTime, maxExecution:_maxExecution, currentExecution:_currentExecution, timeinterval:_timeinterval, exchange:_exchange, active:_active};


             _rules.push(rule)
         }

        tmp_userList.push({walletAddress:user.walletAddress, vaultAddress:user.vaultAddress, rules:_rules})
    }
    users = tmp_userList;


}
async function match(){
    const currentBlockNumber = await wsProvider.getBlockNumber()
    const block = await wsProvider.getBlock(currentBlockNumber)
    const blockTimestamp = block.timestamp;
    console.log("Blocktimestamp")
    console.log(blockTimestamp)
    for(const user of users){
        const rules:Array<Rule>|undefined = user.rules
        if(rules == undefined){continue;}
        for(const rule of rules){
            if(rule.active == false){continue;}
            if(rule.currentExecution == rule.maxExecution){continue;}
            if(blockTimestamp>rule.excTime){continue;}

            //todo: check rulePrice vs 
            //if send transaction add to blocklist

        }

    }
}


function addUserToBlockList(_userWallet:string){
    blockList.push({userWallet:_userWallet, blockedUntil:Date.now()+blockedForMs})
}
//todo: Add user removal from Blocklist
function isUserBlocked(_userWallet:string){
    for(const blockedUser of blockList){
        if(blockedUser.userWallet.toUpperCase() == _userWallet.toUpperCase() && blockedUser.blockedUntil>Date.now()){
            return true;
        }
    }
    return false;
}


async function main(){


    //Get All vaults
    const currentBlock = await wsProvider.getBlockNumber()
    await getNewVault(lastBlock, currentBlock)
    lastBlock = currentBlock

    //Update all rules for all vaults
    await updateRulesForUsers()
    //Check if matching

   
    //Every 10 Seconds:
        //Get all rules

    //Every 5 seconds:
    //Check all rules
        //Execute TX

}
main()


