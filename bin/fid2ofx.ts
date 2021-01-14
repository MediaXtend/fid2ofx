#!/usr/bin/env ts-node-script
/// <reference types="./types/config" />
import yargs from "yargs/yargs";
import { exit } from "yargs";
import fs from "fs";
import parse from "csv-parse/lib/sync";
import { create as createXML } from "xmlbuilder2";
// import iconv from 'iconv-lite';

import config from "./config";
interface Arguments {
  csv: string;
}
const argv: Arguments = yargs(process.argv.slice(2)).options({
  csv: { type: "string", desc: "CSV file", demandOption: true },
  "last-balance": { type: "number", desc: "Account balance at last operation", demandOption: true },
}).argv;

const csvPath: string = ("csv" in argv ? argv.csv : "");
if (csvPath.length === 0) {
  throw new Error("CSV file path is missing");
}

const lastBalance: number = ("last-balance" in argv ? parseFloat(argv["last-balance"]) : 0);
if (lastBalance === 0) {
  throw new Error("Last balance can’t be at zero");
}

fs.open(csvPath, "r", (err: NodeJS.ErrnoException | null) => {
  if (err && err.code === "ENOENT") {
    const error = new Error(`The file "${csvPath}" does not exists.`);
    console.error(error.message);
    exit(1, error);
  }

  if (err) {
    throw err;
  }

  fs.readFile(csvPath, { encoding: config.csv.encoding }, (err, data) => {
    if (err) {
      throw err;
    }

    const pathLastSlashIndex: number = csvPath.lastIndexOf("/");
    const fileBaseName: string = csvPath.substr(
      pathLastSlashIndex !== undefined ? pathLastSlashIndex + 1 : 0,
      csvPath.lastIndexOf(".") - pathLastSlashIndex - 1
    );

    const csvData: string = data.toString();
    // console.log(csvData);
    
    const lineBreak: RegExp = new RegExp(config.csv.lineBreak);
    const lines: Array<string> = csvData
      .split(lineBreak)
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0);

    const semicolonEndingLine: RegExp = /;[ ]*$/;
    const everyLinesHaveEndingSemicolon: boolean = lines.reduce((hasEndingSemicolon: boolean, line: string) => (hasEndingSemicolon && semicolonEndingLine.test(line)), true);
    
    const csvClean: string = (everyLinesHaveEndingSemicolon
      ? lines.map((line: string) => line.replace(semicolonEndingLine, ""))
      : lines
    ).join(config.csv.lineBreak);

    const configColumns: ConfigColumns = Object.keys(config.columns)
      .reduce(
        (ret: ConfigColumns, name: string) => ({
          ...ret,
          [config.columns[name].name]: {
            name,
            parser: config.columns[name].parser,
          },
        }),
        {}
      );

    interface RawRecord {
      [key: string]: string;
    }
    interface ObjectIndexer<T> {
      [id: string]: T;
    }
    interface Record extends ObjectIndexer<null | string | number | Date | BankAccount> {
      accountId: null | BankAccount;
      accountType: string;
      currency: string;
      amount: number;
      operationDate: Date;
      valueDate: Date;
      checkNumber: null | string;
      operationName: string;
    }
    const emptyRecord: Record = {
      accountId: null,
      accountType: "",
      currency: "",
      amount: 0,
      operationDate: new Date(1970, 0, 1),
      valueDate: new Date(1970, 0, 1),
      checkNumber: null,
      operationName: "",
    };
    const rawRecords: Array<RawRecord> = parse(csvClean, { delimiter: config.csv.delimiter, trim: true, columns: true });
    if (rawRecords.length === 0) {
      throw new Error("CSV file is empty");
    }
    const records: Array<Record> = rawRecords.map((rawRecord: RawRecord) => (
      Object.keys(rawRecord)
        .reduce(
          (obj: Record, col: string) => {
            const csvColumn: ConfigColumn | null = (col in configColumns ? configColumns[col] : null);
            if (csvColumn && csvColumn.name in obj) {
              // obj[csvColumn.name as keyof Record] = csvColumn.parser(rawRecord[col]);
              obj[csvColumn.name] = csvColumn.parser(rawRecord[col]);
            }
            // if (csvColumn) {
            //   console.log('csv column name: ' + col);
            //   console.log('csv column value: ' + obj[csvColumn.name]);
            // }
            return obj;
          },
          { ...emptyRecord }
        )
    )).sort((a: Record, b: Record) => (a.operationDate.getTime() > b.operationDate.getTime() ? -1 : 1));

    const guessTransactionType = (record: Record): string => {
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
    const ofxDateFormatter = (date: Date): string => {
      const year: string = date.getFullYear().toString();
      const month: string = date.getMonth().toString().padStart(2, "0");
      const day: string = date.getDate().toString().padStart(2, "0");
      return `${year}${month}${day}120000`;
    };
    const hashAsNumbers = (s: string): string => {
      const hashCode: number = s.split("").reduce((a,b)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a;},0);
      return `${Math.abs(hashCode)}`;
    };

    const newestRecord: Record = records[0];
    const oldestRecord: Record = records[records.length - 1];

    // console.log(`records: ${JSON.stringify(records, undefined, 2)}`);
    // console.log(`first record operationDate: ${ofxDateFormatter(records[0].operationDate)}`);

    // build OFX
    const ofx = createXML().ele("OFX");
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

    records.forEach((r: Record) => {
      const nameMatches = r.operationName.match(/^(.+)  ([A-Z ]+)$/);
      const name: string = (nameMatches !== null ? nameMatches[1] : r.operationName);
      const memo: string = (nameMatches !== null ? nameMatches[2] : "");
      const transId: string = (nameMatches !== null
        ? `${name}${ofxDateFormatter(r.operationDate)}`
        : `${r.operationName}${ofxDateFormatter(r.operationDate)}`
      );
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

    const xmlStr: string = ofx.toString({
      allowEmptyTags: true,
      prettyPrint: true,
      indent: "    ",
    });
    // console.log(xmlStr);

    interface OfxHeadersIndexer<T> {
      [id: string]: T;
    }
    // OFX headers
    const ofxHeaders: OfxHeadersIndexer<string> = config.ofx.headers;
    const ofxHeadersStr: string = Object.keys(ofxHeaders)
      .map((headerKey: string) => `${headerKey}:${ofxHeaders[headerKey]}`)
      .join("\n");
    // console.log(ofxHeadersStr);

    const ofxContentUtf: string = `${ofxHeadersStr}\n\n${xmlStr}`;
    // console.log(ofxContentUtf);

    fs.writeFile(`${fileBaseName}.ofx`, "\ufeff" + ofxContentUtf, { encoding: "utf-8" }, () => {
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