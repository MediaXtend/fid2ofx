#!/usr/bin/env ts-node-script
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/// <reference types="./types/config" />
const yargs_1 = __importDefault(require("yargs/yargs"));
const yargs_2 = require("yargs");
const fs_1 = __importDefault(require("fs"));
const sync_1 = __importDefault(require("csv-parse/lib/sync"));
const xmlbuilder2_1 = require("xmlbuilder2");
// import iconv from 'iconv-lite';
const config_1 = __importDefault(require("./config"));
const argv = yargs_1.default(process.argv.slice(2)).options({
    csv: { type: "string", desc: "CSV file", demandOption: true },
    "last-balance": { type: "number", desc: "Account balance at last operation", demandOption: true },
}).argv;
const csvPath = ("csv" in argv ? argv.csv : "");
if (csvPath.length === 0) {
    throw new Error("CSV file path is missing");
}
const lastBalance = ("last-balance" in argv ? parseFloat(argv["last-balance"]) : 0);
if (lastBalance === 0) {
    throw new Error("Last balance can’t be at zero");
}
fs_1.default.open(csvPath, "r", (err) => {
    if (err && err.code === "ENOENT") {
        const error = new Error(`The file "${csvPath}" does not exists.`);
        console.error(error.message);
        yargs_2.exit(1, error);
    }
    if (err) {
        throw err;
    }
    fs_1.default.readFile(csvPath, { encoding: config_1.default.csv.encoding }, (err, data) => {
        if (err) {
            throw err;
        }
        const pathLastSlashIndex = csvPath.lastIndexOf("/");
        const fileBaseName = csvPath.substr(pathLastSlashIndex !== undefined ? pathLastSlashIndex + 1 : 0, csvPath.lastIndexOf(".") - pathLastSlashIndex - 1);
        const csvData = data.toString();
        // console.log(csvData);
        const lineBreak = new RegExp(config_1.default.csv.lineBreak);
        const lines = csvData
            .split(lineBreak)
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
        const semicolonEndingLine = /;[ ]*$/;
        const everyLinesHaveEndingSemicolon = lines.reduce((hasEndingSemicolon, line) => (hasEndingSemicolon && semicolonEndingLine.test(line)), true);
        const csvClean = (everyLinesHaveEndingSemicolon
            ? lines.map((line) => line.replace(semicolonEndingLine, ""))
            : lines).join(config_1.default.csv.lineBreak);
        const configColumns = Object.keys(config_1.default.columns)
            .reduce((ret, name) => (Object.assign(Object.assign({}, ret), { [config_1.default.columns[name].name]: {
                name,
                parser: config_1.default.columns[name].parser,
            } })), {});
        const emptyRecord = {
            accountId: null,
            accountType: "",
            currency: "",
            amount: 0,
            operationDate: new Date(1970, 0, 1),
            valueDate: new Date(1970, 0, 1),
            checkNumber: null,
            operationName: "",
        };
        const rawRecords = sync_1.default(csvClean, { delimiter: config_1.default.csv.delimiter, trim: true, columns: true });
        if (rawRecords.length === 0) {
            throw new Error("CSV file is empty");
        }
        const records = rawRecords.map((rawRecord) => (Object.keys(rawRecord)
            .reduce((obj, col) => {
            const csvColumn = (col in configColumns ? configColumns[col] : null);
            if (csvColumn && csvColumn.name in obj) {
                // obj[csvColumn.name as keyof Record] = csvColumn.parser(rawRecord[col]);
                obj[csvColumn.name] = csvColumn.parser(rawRecord[col]);
            }
            // if (csvColumn) {
            //   console.log('csv column name: ' + col);
            //   console.log('csv column value: ' + obj[csvColumn.name]);
            // }
            return obj;
        }, Object.assign({}, emptyRecord)))).sort((a, b) => (a.operationDate.getTime() > b.operationDate.getTime() ? -1 : 1));
        const guessTransactionType = (record) => {
            if (/^(PRVL[ -]SEPA|SEPA[ -]PRLV) /.test(record.operationName)) {
                return "Prélèvements SEPA domiciliés";
            }
            if (/^(VIR[ -]SEPA|SEPA[ -]VIRT) /.test(record.operationName)) {
                return (record.amount < 0 ? "Virements émis" : "Virements reçus");
            }
            if (/^([0-3][0-9](0[1-9]|1[0-2])2[0-9][A-Z]|CB )/.test(record.operationName)) {
                return "Factures cartes payées";
            }
            if (/^(FRS\/PACK |Cotisation Club Entrepreneur)/.test(record.operationName)) {
                return "Commissions et frais divers";
            }
            return "Opérations diverses";
        };
        const ofxDateFormatter = (date) => {
            const year = date.getFullYear().toString();
            const month = (date.getMonth() + 1).toString().padStart(2, "0");
            const day = date.getDate().toString().padStart(2, "0");
            return `${year}${month}${day}120000`;
        };
        const hashAsNumbers = (s) => {
            const hashCode = s.split("").reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0);
            return `${Math.abs(hashCode)}`;
        };
        const newestRecord = records[0];
        const oldestRecord = records[records.length - 1];
        // console.log(`records: ${JSON.stringify(records, undefined, 2)}`);
        // console.log(`first record operationDate: ${ofxDateFormatter(records[0].operationDate)}`);
        // build OFX
        const ofx = xmlbuilder2_1.create().ele("OFX");
        ofx
            .ele("SIGNONMSGSRQV1")
            .ele("SONRQ")
            .ele("STATUS")
            .ele("CODE").txt("0").up()
            .ele("SEVERITY").txt("INFO").up()
            .up()
            .ele("DTSERVER").txt(ofxDateFormatter(newestRecord.operationDate)).up()
            .ele("LANGUAGE").txt("FRA").up();
        if (newestRecord.accountId === null) {
            throw new Error("Can not find bank account.");
        }
        const transactionsList = ofx
            .ele("BANKMSGSRQV1")
            .ele("STMTTRNRS")
            .ele("TRNUID").txt(ofxDateFormatter(newestRecord.operationDate)).up()
            .ele("STATUS")
            .ele("CODE").txt("0").up()
            .ele("SEVERITY").txt("INFO").up()
            .up()
            .ele("STMTRS")
            .ele("CURDEF").txt(newestRecord.currency).up()
            .ele("BANKACCTFROM")
            .ele("BANKID").txt(newestRecord.accountId.bankCode).up()
            .ele("BRANCHID").txt(newestRecord.accountId.branchNumber).up()
            .ele("ACCTID").txt(newestRecord.accountId.accountNumber).up()
            .ele("ACCTTYPE").txt(newestRecord.accountType).up()
            .up()
            .ele("BANKTRANLIST")
            .ele("DTSTART").txt(ofxDateFormatter(oldestRecord.operationDate)).up()
            .ele("DTEND").txt(ofxDateFormatter(newestRecord.operationDate)).up();
        records.forEach((r) => {
            const nameMatches = r.operationName.match(/^(.+)  ([A-Z ]+)$/);
            const name = (nameMatches !== null ? nameMatches[1] : r.operationName);
            const memo = (nameMatches !== null ? nameMatches[2] : "");
            const transId = (nameMatches !== null
                ? `${name}${ofxDateFormatter(r.operationDate)}`
                : `${r.operationName}${ofxDateFormatter(r.operationDate)}`);
            transactionsList.ele("STMTTRN")
                .ele("TRNTYPE").txt(guessTransactionType(r)).up()
                .ele("DTPOSTED").txt(ofxDateFormatter(r.operationDate)).up()
                .ele("DTUSER").txt(ofxDateFormatter(r.operationDate)).up()
                .ele("DTAVAIL").txt(ofxDateFormatter(r.valueDate)).up()
                .ele("TRNAMT").txt(r.amount.toString()).up()
                .ele("FITID").txt(`${transId}-${hashAsNumbers(transId)}`).up()
                .ele("NAME").txt(name).up()
                .ele("MEMO").txt(memo).up()
                .ele("CURRENCY").txt(r.currency).up();
        });
        transactionsList.up()
            .ele("LEDGERBAL")
            .ele("BALAMT").txt(lastBalance.toString()).up()
            .ele("DTASOF").txt(ofxDateFormatter(newestRecord.operationDate)).up()
            .up()
            .ele("AVAILBAL")
            .ele("BALAMT").txt(lastBalance.toString()).up()
            .ele("DTASOF").txt(ofxDateFormatter(newestRecord.operationDate)).up()
            .up();
        let xmlStr = ofx.toString({
            allowEmptyTags: true,
            prettyPrint: true,
            indent: "    ",
        });
        // OFX headers
        const ofxHeaders = config_1.default.ofx.headers;
        const ofxHeadersStr = Object.keys(ofxHeaders)
            .map((headerKey) => `${headerKey}:${ofxHeaders[headerKey]}`)
            .join("\n");
        // console.log(ofxHeadersStr);
        // Close tag (SGML)
        // Default configuration setting: add close tag
        const closeTag = "closeTag" in config_1.default.ofx ? config_1.default.ofx.closeTag : true;
        if (!closeTag) {
            xmlStr = xmlStr.replace(/<([A-Z]+)>(.*)<\/([A-Z]+)>/g, (match, openingTagName, tagContent, closingTagName) => (openingTagName === closingTagName ? `<${openingTagName}>${tagContent}` : match));
        }
        const ofxContentUtf = `${ofxHeadersStr}\n\n${xmlStr}`;
        // console.log(ofxContentUtf);
        fs_1.default.writeFile(`${fileBaseName}.ofx`, "\ufeff" + ofxContentUtf, { encoding: "utf-8" }, () => {
            console.log(`File ${fileBaseName}.ofx wrote successfully.`);
        });
        /*
        fs.open(`${fileBaseName}.ofx`, 'w', (err: NodeJS.ErrnoException | null, ofxFd: number) => {
          if (err) {
            throw new Error(`Unable to create file "${fileBaseName}.ofx" (${err.message})`);
          }
    
          console.log(`Writing ${fileBaseName}.ofx file…`);
          // const ofxContentBuffer: Buffer = iconv.encode(ofxContentUtf, 'win1252');
          // fs.write(ofxFd, ofxContentBuffer, 0, ofxContentBuffer.length, null, (err: NodeJS.ErrnoException | null) => {
          //   if (err) {
          //     throw new Error(`Unable to write file "${fileBaseName}.ofx" (${err.message})`);
          //   }
          //   fs.close(ofxFd, () => {
          //     console.log(`File ${fileBaseName}.ofx wrote successfully.`);
          //   });
          // });
    
          // const ofxContentBuffer: Buffer = Buffer.from(ofxContentBuffer);
          // fs.write(ofxFd, new Buffer(ofxContentUtf), 0, ofxContentBuffer.length, null, (err: NodeJS.ErrnoException | null) => {
          //   if (err) {
          //     throw new Error(`Unable to write file "${fileBaseName}.ofx" (${err.message})`);
          //   }
          //   fs.close(ofxFd, () => {
          //     console.log(`File ${fileBaseName}.ofx wrote successfully.`);
          //   });
          // });
        });
        */
    });
});
