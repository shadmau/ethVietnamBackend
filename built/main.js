"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ethers_1 = require("ethers");
const dotenv_1 = __importDefault(require("dotenv"));
//import {getBTCPriceBitfinex} from "./BTC_BitfinexOracle"
const FACTORYABI = require('./factory.abi');
const VAULTABI = require('./vault.abi');
const path = require('path');
let wsProvider;
const _path = '../.env';
dotenv_1.default.config({ path: path.resolve(_path) });
if (process.env['GETH_WS'] === undefined) {
    throw Error("Dotenv configuration wrong!");
}
wsProvider = new ethers_1.ethers.providers.WebSocketProvider(process.env['GETH_WS']);
const FACTORY_ADDRESS = "0x7c1F44f3e2365f38f72eC3D0B9909b20f28a8B58";
let lastBlock = 29316155;
let blockedForMs = 30000;
let blockList = [];
var Action;
(function (Action) {
    Action[Action["exchange"] = 0] = "exchange";
    Action[Action["payment"] = 1] = "payment";
})(Action || (Action = {}));
var Exchange;
(function (Exchange) {
    Exchange[Exchange["quickswap"] = 0] = "quickswap";
})(Exchange || (Exchange = {}));
let users = [];
const factoryContract = new ethers_1.ethers.Contract(FACTORY_ADDRESS, FACTORYABI, wsProvider);
let newVaultFilter = factoryContract.filters['vaultCreated'];
function getNewVault(fromBlock, toBlock) {
    return __awaiter(this, void 0, void 0, function* () {
        if (newVaultFilter === undefined) {
            throw Error("Filter not found!");
        }
        const events = yield factoryContract.queryFilter(newVaultFilter(), fromBlock, toBlock);
        for (const event of events) {
            console.log("New Vaults created between Block " + fromBlock + " to " + toBlock + ": " + events.length);
            let userAlreadyExists = false;
            for (const user of users) {
                if (event.args === undefined || event.args['creator'] === undefined) {
                    continue;
                }
                if (user.walletAddress.toUpperCase() == event.args['creator'].toUpperCase()) {
                    userAlreadyExists = true;
                }
            }
            if (!userAlreadyExists && event.args != undefined && event.args['creator'] != undefined) {
                users.push({ walletAddress: event.args['creator'], vaultAddress: event.args['newVault'] });
                console.log("New User added: " + event.args['creator'] + " Vault: " + event.args['newVault']);
            }
        }
    });
}
function updateRulesForUsers() {
    return __awaiter(this, void 0, void 0, function* () {
        let tmp_userList = [];
        for (const user of users) {
            if (user.vaultAddress == undefined) {
                throw Error("User Vault not found!");
            }
            const vaultContract = new ethers_1.ethers.Contract(user.vaultAddress, VAULTABI, wsProvider);
            const currentNumberOfRules = yield vaultContract['numOfRules']();
            let _rules = [];
            for (let i = 0; i < currentNumberOfRules; i++) {
                const result = yield vaultContract['rules'](i);
                const _amount = ethers_1.ethers.BigNumber.from(result.amount);
                const _excTime = result.excTime;
                const _maxExecution = result.maxExecution;
                const _currentExecution = result.currentExecution;
                const _timeinterval = result.timeinterval;
                const _exchange = Exchange.quickswap;
                const _active = result.action;
                const _btcPrice = result.btcPrice;
                let _action;
                if (result.action == 0) {
                    _action = Action.exchange;
                }
                else {
                    _action = Action.payment;
                }
                const rule = { id: i, btcPrice: _btcPrice, action: _action, amount: _amount, excTime: _excTime, maxExecution: _maxExecution, currentExecution: _currentExecution, timeinterval: _timeinterval, exchange: _exchange, active: _active };
                _rules.push(rule);
            }
            tmp_userList.push({ walletAddress: user.walletAddress, vaultAddress: user.vaultAddress, rules: _rules });
        }
        users = tmp_userList;
    });
}
function match() {
    return __awaiter(this, void 0, void 0, function* () {
        const currentBlockNumber = yield wsProvider.getBlockNumber();
        const block = yield wsProvider.getBlock(currentBlockNumber);
        const blockTimestamp = block.timestamp;
        console.log("Blocktimestamp");
        console.log(blockTimestamp);
        for (const user of users) {
            const rules = user.rules;
            if (rules == undefined) {
                continue;
            }
            for (const rule of rules) {
                if (rule.active == false) {
                    continue;
                }
                if (rule.currentExecution == rule.maxExecution) {
                    continue;
                }
                if (blockTimestamp > rule.excTime) {
                    continue;
                }
                //todo: check rulePrice vs 
                //if send transaction add to blocklist
            }
        }
    });
}
function addUserToBlockList(_userWallet) {
    blockList.push({ userWallet: _userWallet, blockedUntil: Date.now() + blockedForMs });
}
//todo: Add user removal from Blocklist
function isUserBlocked(_userWallet) {
    for (const blockedUser of blockList) {
        if (blockedUser.userWallet.toUpperCase() == _userWallet.toUpperCase() && blockedUser.blockedUntil > Date.now()) {
            return true;
        }
    }
    return false;
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        //Get All vaults
        const currentBlock = yield wsProvider.getBlockNumber();
        yield getNewVault(lastBlock, currentBlock);
        lastBlock = currentBlock;
        //Update all rules for all vaults
        yield updateRulesForUsers();
        //Check if matching
        //Every 10 Seconds:
        //Get all rules
        //Every 5 seconds:
        //Check all rules
        //Execute TX
    });
}
main();
//# sourceMappingURL=main.js.map