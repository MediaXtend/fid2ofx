"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dateParser = (value) => {
    const matches = value.match(/([0-3][0-9])\/([0][1-9]|1[0-2])\/(20[1-9][0-9])/);
    if (matches === null) {
        throw new Error(`Unable to parse the following string as a date: "${value}"`);
    }
    return new Date(parseInt(matches[3], 10), parseInt(matches[2], 10) - 1, parseInt(matches[1], 10), 12, 0, 0, 0);
};
const config = {
    csv: {
        encoding: "latin1",
        delimiter: ";",
        lineBreak: "\r\n",
    },
    columns: {
        accountId: {
            name: "Numéro de compte",
            parser: (value) => {
                const matches = value.match(/^FR30(11449)([0-9]{5})([0-9]{10}[A-Z])([0-9]{2})$/);
                if (matches === null) {
                    throw new Error(`Can not parse account identifier, column value is: ${value}`);
                    // return null;
                }
                return {
                    bankCode: matches[1],
                    branchNumber: matches[2],
                    accountNumber: matches[3],
                    iban: matches[0],
                };
            },
        },
        accountType: {
            name: "Intitulé du compte",
            parser: (value) => (/^COMPTE COURANT.*$/.test(value) ? "CHECKING" : "SAVINGS"),
        },
        currency: {
            name: "Code devise",
            parser: (value) => (value),
        },
        amount: {
            name: "Montant",
            parser: (value) => (parseFloat(value.replace(/,/, "."))),
        },
        operationDate: {
            name: "Date d'opération",
            parser: dateParser,
        },
        valueDate: {
            name: "Date de valeur",
            parser: dateParser,
        },
        checkNumber: {
            name: "Numéro de chèque",
            parser: (value) => (value.length > 0 ? value : null),
        },
        operationName: {
            name: "Libellé d'opération",
            parser: (value) => (value),
        },
    },
    ofx: {
        headers: {
            OFXHEADER: "100",
            DATA: "OFXSGML",
            VERSION: "102",
            SECURITY: "NONE",
            ENCODING: "UTF-8",
            CHARSET: "1252",
            COMPRESSION: "NONE",
            OLDFILEUID: "NONE",
            NEWFILEUID: "NONE",
        },
        closeTag: false,
    },
};
exports.default = config;
