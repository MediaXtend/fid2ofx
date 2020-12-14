#!/usr/bin/env node
import yargs from 'yargs/yargs';
import { exit } from 'yargs';
import fs from 'fs';
import parse from 'csv-parse/lib/sync';

import config from './config';

const argv = yargs(process.argv.slice(2)).options({
  _: { type: 'string', demandOption: true },
}).argv;

const csvPath: string = (argv._.length > 0 ? argv._[0] : '');

fs.open(csvPath, 'r', (err, fd) => {
  if (err) {
    if (err.code === 'ENOENT') {
      const error = new Error(`The file "${csvPath}" does not exists.`);
      console.error(error.message);
      exit(1, error);
    }

    throw err;
  }

  fs.readFile(csvPath, { encoding: config.csv.encoding }, (err, data) => {
    if (err) {
      throw err;
    }

    const csvData = data.toString();
    // console.log(csvData);

    const lines = csvData

    

    const records: Array<string> = parse(csvData, { delimiter: config.csv.delimiter, trim: true, columns: true });
    console.log('records length: ' + records.length);
    records.forEach(record => {
      console.log('record: ' + JSON.stringify(record));
    });

  });
});