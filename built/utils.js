"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sleep = exports.redLog = exports.yellowLog = exports.blueLog = exports.greenLog = void 0;
function greenLog(msg, fnct) {
    console.log('\x1b[32m%s\x1b[0m', Date.now() + +" " + fnct + ": " + msg);
}
exports.greenLog = greenLog;
function blueLog(msg, fnct) {
    console.log('\x1b[34m%s\x1b[0m', Date.now() + +" " + fnct + ": " + msg);
}
exports.blueLog = blueLog;
function yellowLog(msg, fnct) {
    console.log('\x1b[33m%s\x1b[0m', Date.now() + " " + fnct + ": " + msg);
}
exports.yellowLog = yellowLog;
function redLog(msg, fnct) {
    console.log('\x1b[31m%s\x1b[0m', Date.now() + " " + fnct + ": " + msg);
}
exports.redLog = redLog;
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
exports.sleep = sleep;
