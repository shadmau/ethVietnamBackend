function greenLog(msg: string, fnct: string) {
    console.log('\x1b[32m%s\x1b[0m', Date.now()+  + " " + fnct + ": " + msg)
}
function blueLog(msg: string, fnct: string) {
    console.log('\x1b[34m%s\x1b[0m', Date.now() +  + " " +fnct + ": " + msg)
}
function yellowLog(msg: string, fnct: string) {

    console.log('\x1b[33m%s\x1b[0m', Date.now() + " " +fnct + ": " + msg)
}

function redLog(msg: string, fnct: string) {

    console.log('\x1b[31m%s\x1b[0m', Date.now() + " " +fnct + ": " + msg)
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}





export {greenLog, blueLog, yellowLog, redLog, sleep }
