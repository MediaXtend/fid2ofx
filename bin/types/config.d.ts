interface BankAccount {
  bankCode: string;
  branchNumber: string;
  accountNumber: string;
  iban: string;
}

interface ConfigColumn {
  name: string;
  parser: (value: string) => null | string | number | Date | BankAccount,
}

interface ConfigColumns {
  [key: string]: ConfigColumn;
}

interface OfxHeaders<string> {
  OFXHEADER: string;
  DATA: string;
  VERSION: string;
  SECURITY: string;
  ENCODING: string;
  CHARSET: string;
  COMPRESSION: string;
  OLDFILEUID: string;
  NEWFILEUID: string;
}

interface Config {
  csv: {
    encoding: string;
    delimiter: string;
    lineBreak: string;
  }
  columns: ConfigColumns;
  ofx: {
    headers: OfxHeaders;
    closeTag: boolean;
  }
}
