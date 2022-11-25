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
const unidici = require("undici");
const utils_1 = require("./utils");
function getBTCPriceBitfinex() {
    return __awaiter(this, void 0, void 0, function* () {
        const url = "https://api-pub.bitfinex.com/v2/tickers?symbols=tBTCUSD";
        let result = yield unidici.request(url, { headers: { 'content-type': 'application/json' } });
        if (result.statusCode == 200) {
            const priceArr = yield result.body.json();
            return ethers_1.ethers.utils.parseEther(priceArr[0][7].toString());
        }
        else {
            console.log("Bitfinex Request faild");
            return null;
        }
    });
}
const FACTORYABI = require('./factory.abi');
const VAULTABI = require('./vault.abi');
const path = require('path');
let wsProvider;
const _path = '../.env';
dotenv_1.default.config({ path: path.resolve(_path) });
if (process.env['EXECUTER_PW'] == undefined || process.env['GETH_WS'] === undefined) {
    throw Error("Dotenv configuration wrong!");
}
wsProvider = new ethers_1.ethers.providers.WebSocketProvider(process.env['GETH_WS']);
const executerWallet = new ethers_1.ethers.Wallet(process.env['EXECUTER_PW'], wsProvider);
const FACTORY_ADDRESS = "0x5E4c483d580cD024FF82ae63D9F4c18d7215A774";
let lastBlock = 29316155;
let blockedForMs = 300000;
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
        const fnct = "MAIN.getNewVault";
        if (newVaultFilter === undefined) {
            throw Error("Filter not found!");
        }
        const events = yield factoryContract.queryFilter(newVaultFilter(), fromBlock, toBlock);
        for (const event of events) {
            (0, utils_1.blueLog)("New Vaults created between Block " + fromBlock + " to " + toBlock + ": " + events.length, fnct);
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
                (0, utils_1.greenLog)("New User added: " + event.args['creator'] + " Vault: " + event.args['newVault'], fnct);
            }
        }
    });
}
function updateRulesForUsers() {
    return __awaiter(this, void 0, void 0, function* () {
        const fnct = "Main.updateRulesForUsers";
        let tmp_userList = [];
        for (const user of users) {
            if (user.vaultAddress == undefined) {
                throw Error("User Vault not found!");
            }
            const vaultContract = new ethers_1.ethers.Contract(user.vaultAddress, VAULTABI, wsProvider);
            const currentNumberOfRules = yield vaultContract['numOfRules']();
            let userRulesAmount = 0;
            if (user.rules !== undefined) {
                if (currentNumberOfRules.eq(user.rules.length)) {
                    tmp_userList.push(user);
                    (0, utils_1.greenLog)("No new rule for user! Continue.", fnct);
                    continue;
                }
                else {
                    userRulesAmount = user.rules.length;
                }
            }
            (0, utils_1.yellowLog)("New Rules for user " + user.walletAddress + " : " + currentNumberOfRules.sub(userRulesAmount), fnct);
            let _rules = [];
            for (let i = 0; i < currentNumberOfRules; i++) {
                const result = yield vaultContract['rules'](i);
                const _amount = ethers_1.ethers.BigNumber.from(result.amount);
                const _excTime = result.excTime;
                const _maxExecution = result.maxExecution;
                const _currentExecution = result.currentExecution;
                const _timeinterval = result.timeinterval;
                const _exchange = Exchange.quickswap;
                const _active = result.active;
                const _btcPriceOffchain = result.btcPriceOffchain;
                const _needsToBeLower = result.needsToBeLower;
                let _action;
                if (result.action == 0) {
                    _action = Action.exchange;
                }
                else {
                    _action = Action.payment;
                }
                const rule = { id: i, btcPriceOffchain: _btcPriceOffchain, needsToBeLower: _needsToBeLower, action: _action, amount: _amount, excTime: _excTime, maxExecution: _maxExecution, currentExecution: _currentExecution, timeinterval: _timeinterval, exchange: _exchange, active: _active };
                _rules.push(rule);
            }
            tmp_userList.push({ walletAddress: user.walletAddress, vaultAddress: user.vaultAddress, rules: _rules });
        }
        users = tmp_userList;
    });
}
function match() {
    return __awaiter(this, void 0, void 0, function* () {
        const fnct = "MAIN.match";
        const currentBlockNumber = yield wsProvider.getBlockNumber();
        const block = yield wsProvider.getBlock(currentBlockNumber);
        const blockTimestamp = block.timestamp;
        const currentPrice = yield getBTCPriceBitfinex();
        if (currentPrice == null) {
            (0, utils_1.redLog)("Couldnt fetch price. No matching", fnct);
            return;
        }
        for (const user of users) {
            const rules = user.rules;
            if (rules == undefined) {
                continue;
            }
            for (const rule of rules) {
                (0, utils_1.blueLog)("Checking Rule " + rule.id + " of user " + user.walletAddress, fnct);
                if (isUserBlocked(user.walletAddress, rule.id)) {
                    (0, utils_1.redLog)("Rule " + rule.id + " of user " + user.walletAddress + " still executing", fnct);
                    continue;
                } //todo: Add ruleid
                if (rule.active == false) {
                    (0, utils_1.yellowLog)("Rule not active", fnct);
                    continue;
                }
                if (rule.currentExecution >= rule.maxExecution) {
                    (0, utils_1.yellowLog)("Max Exc reached", fnct);
                    continue;
                }
                if (rule.excTime > blockTimestamp) {
                    (0, utils_1.yellowLog)("Execution time not reached yet. Still need " + (rule.excTime - blockTimestamp) + " ms", fnct);
                    continue;
                }
                if ((rule.needsToBeLower == true && currentPrice.lt(rule.btcPriceOffchain)) || (rule.needsToBeLower == false && currentPrice.gt(rule.btcPriceOffchain))) {
                    execTransaction(user, rule.id);
                }
                else {
                    (0, utils_1.greenLog)("Price not reached", fnct);
                }
            }
        }
    });
}
function execTransaction(user, ruleID) {
    return __awaiter(this, void 0, void 0, function* () {
        const fnct = "MAIN.execTransaction";
        (0, utils_1.yellowLog)("Executing Rule " + ruleID + " of User" + user.walletAddress + " (Vault: " + user.vaultAddress + ")", fnct);
        (0, utils_1.yellowLog)("Adding to blacklist", fnct);
        addUserToBlockList(user.walletAddress, ruleID); //todo: Add ruleid
        (0, utils_1.blueLog)("Sending execution tx for user " + user.walletAddress + " to vault " + user.vaultAddress + " for Rule " + ruleID, fnct);
        const vaultContract = new ethers_1.ethers.Contract(user.vaultAddress, VAULTABI, executerWallet);
        const result = yield vaultContract['execRule'](ruleID, { type: 0, gasPrice: 300000000000 });
        (0, utils_1.greenLog)("Transaction sent", fnct);
        console.log(result);
    });
}
function addUserToBlockList(_userWallet, ruleID) {
    blockList.push({ userWallet: _userWallet, blockedUntil: Date.now() + blockedForMs, ruleID });
}
//todo: Add user removal from Blocklist
function isUserBlocked(_userWallet, ruleID) {
    for (const blockedUser of blockList) {
        if (blockedUser.userWallet.toUpperCase() == _userWallet.toUpperCase() && blockedUser.blockedUntil > Date.now() && blockedUser.ruleID == ruleID) {
            return true;
        }
    }
    return false;
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        let iteration = 0;
        const fnct = "MAIN.main";
        while (true) {
            (0, utils_1.yellowLog)("Iteration: " + iteration + "\r\n-------------", fnct);
            //Get All vaults
            const currentBlock = yield wsProvider.getBlockNumber();
            yield getNewVault(lastBlock, currentBlock);
            lastBlock = currentBlock;
            //Update all rules for all vaults
            yield updateRulesForUsers();
            //Check if matching
            yield match();
            yield (0, utils_1.sleep)(3000);
            iteration++;
        }
    });
}
main();
//# sourceMappingURL=main.js.map