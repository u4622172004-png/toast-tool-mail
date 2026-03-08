#!/usr/bin/env node

const fs = require('fs');
const readline = require('readline');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const FILE = 'accounts.json';
let accounts = [];
let lastMessageCounts = {};

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// --- Funzioni di gestione account ---
function saveAccounts() {
    fs.writeFileSync(FILE, JSON.stringify(accounts, null, 2));
}

function loadAccounts() {
    if (fs.existsSync(FILE)) {
        accounts = JSON.parse(fs.readFileSync(FILE));
        accounts.forEach(acc => {
            if (!lastMessageCounts[acc.email]) lastMessageCounts[acc.email] = 0;
        });
    }
}

async function createAccount() {

    const domainRes = await fetch('https://api.mail.tm/domains');
    const domainData = await domainRes.json();
    const domain = domainData['hydra:member'][0].domain;

    const local = Math.random().toString(36).substring(2, 10);
    const email = `${local}@${domain}`;
    const password = Math.random().toString(36).substring(2, 10);

    await fetch('https://api.mail.tm/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: email, password })
    });

    const loginRes = await fetch('https://api.mail.tm/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: email, password })
    });

    const loginData = await loginRes.json();

    const account = { email, password, token: loginData.token };
    accounts.push(account);
    lastMessageCounts[email] = 0;
    saveAccounts();
    console.log(`\n✨ Email temporanea creata: ${email}\n`);
}

// --- Funzioni per leggere email ---
async function fetchMessages(account) {
    const res = await fetch('https://api.mail.tm/messages', {
        headers: { Authorization: `Bearer ${account.token}` }
    });
    const data = await res.json();
    const messages = data['hydra:member'] || [];
    if (messages.length > lastMessageCounts[account.email]) {
        console.log('\x07'); // beep
        console.log(`\n📥 Nuovi messaggi per ${account.email}: ${messages.length - lastMessageCounts[account.email]}\n`);
        lastMessageCounts[account.email] = messages.length;
    }
    return messages;
}

async function readMessage(account, id) {
    const res = await fetch(`https://api.mail.tm/messages/${id}`, {
        headers: { Authorization: `Bearer ${account.token}` }
    });
    if (!res.ok) return null;
    const content = await res.json();
    return content;
}

// --- Menu principale ---
async function showMenu() {
    console.log(`
╔════════════════════════════════════════════════════╗
║ ╔════════════════════════════════════════════════╗ ║
║ ║                                                ║ ║
║ ║  ████████╗ ██████╗  █████╗ ███████╗████████╗   ║ ║
║ ║  ╚══██╔══╝██╔═══██╗██╔══██╗██╔════╝╚══██╔══╝   ║ ║
║ ║     ██║   ██║   ██║███████║███████╗   ██║      ║ ║
║ ║     ██║   ██║   ██║██╔══██║╚════██║   ██║      ║ ║
║ ║     ██║   ╚██████╔╝██║  ██║███████║   ██║      ║ ║
║ ║     ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚══════╝   ╚═╝      ║ ║
║ ║                                                ║ ║
║ ╚════════════════════════════════════════════════╝ ║
╚════════════════════════════════════════════════════╝
`);
console.log('\x1b[32m      BY TOAST MAIL TOOL \x1b[0m');
    if (accounts.length === 0) {
        console.log('  ❌ Nessun account attivo');
    } else {
        accounts.forEach((acc, i) => console.log(
`  ${i+1}. ${acc.email}`));
    }

    console.log(`
[1] Crea nuova email

[2] Controlla inbox di un account

[3] Leggi messaggio completo

[4] Resetta email

[5] Controlla tutte le inbox

[6] Esci
`);

    rl.question('Scegli un\'opzione: ', async (answer) => {
        switch(answer.trim()) {
            case '1':
                await createAccount();
                break;

            case '2': {
                const acc = await chooseAccount('Seleziona account per inbox');
                if (acc) await showInbox(acc);
                break;
            }

            case '3': {
                const acc = await chooseAccount('Seleziona account per leggere messaggio');
                if (acc) {
                    rl.question('Inserisci ID messaggio (primi 6 caratteri): ', async (id) => {
                        await showMessage(acc, id);
                        await showMenu();
                    });
                    return;
                }
                break;
            }

            case '4': {
                const acc = await chooseAccount('Seleziona account da resettare');
                if (acc) {
                    accounts = accounts.filter(a => a.email !== acc.email);
                    delete lastMessageCounts[acc.email];
                    saveAccounts();
                    console.log(`🔄 Email ${acc.email} resettata`);
                }
                break;
            }

            case '5': {
                if (accounts.length === 0) console.log('❌ Nessun account attivo');
                else {
                    for (const acc of accounts) {
                        await showInbox(acc);
                    }
                }
                break;
            }

            case '6':
                console.log('👋 Uscita');
                process.exit(0);

            default:
                console.log('❌ Opzione non valida');
        }
        await showMenu();
    });
}

// --- Funzioni utility ---
async function chooseAccount(promptText) {
    if (accounts.length === 0) return null;
    accounts.forEach((acc, i) => console.log(`  ${i+1}. ${acc.email}`));
    return new Promise(resolve => {
        rl.question(`${promptText} (numero): `, answer => {
            const idx = parseInt(answer.trim()) - 1;
            if (idx >= 0 && idx < accounts.length) resolve(accounts[idx]);
            else {
                console.log('❌ Selezione non valida');
                resolve(null);
            }
        });
    });
}

async function showInbox(acc) {
    const messages = await fetchMessages(acc);
    console.log(`\n📥 Inbox ${acc.email}:`);
    if (messages.length === 0) console.log('  (vuota)');
    else messages.forEach(m => {
        console.log(`  ID: ${m.id.slice(0,6)} | Da: ${m.from.address} | Oggetto: ${m.subject}`);
    });
    console.log('-----------------------------\n');
}

async function showMessage(acc, id) {
    const messages = await fetchMessages(acc);
    const msg = messages.find(m => m.id.startsWith(id));
    if (!msg) console.log(`❌ Messaggio con ID ${id} non trovato`);
    else {
        const content = await readMessage(acc, msg.id);
        if (!content) console.log('❌ Errore nel recupero del messaggio');
        else {
            console.log('\n📧 Messaggio completo:');
            console.log(`Da: ${content.from.address}`);
            console.log(`Oggetto: ${content.subject}`);
            console.log(`Data: ${new Date(content.introdate).toLocaleString()}`);
            console.log('--- Contenuto ---');
            console.log(content.text || content.textHtml || '[Nessun contenuto testuale]');
            console.log('-----------------\n');
        }
    }
}

// --- Auto refresh inbox per tutti gli account ---
async function autoRefresh() {
    for (const acc of accounts) {
        await fetchMessages(acc);
    }
    setTimeout(autoRefresh, 10000);
}

// --- Avvio ---
loadAccounts();
autoRefresh();
showMenu();
