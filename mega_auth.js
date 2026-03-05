const { Storage } = require('megajs');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('--- MEGA SESSION GENERATOR ---');

rl.question('Enter MEGA Email: ', (email) => {
    rl.question('Enter MEGA Password: ', (password) => {
        console.log('\nLogging in...');

        const storage = new Storage({
            email: email,
            password: password,
            autologin: true
        });

        storage.ready.then(() => {
            console.log('\n✅ Login Successful!');
            console.log('--------------------------------------------------');
            console.log('YOUR MEGA_SESSION ID:');
            console.log(storage.session);
            console.log('--------------------------------------------------');
            console.log('\n👉 Copy the LONG code above (starting with "SID:")');
            console.log('👉 Paste it into your Vercel Environment Variable "MEGA_SESSION"');
            process.exit(0);
        }).catch(err => {
            console.error('\n❌ Login Failed:', err.message);
            process.exit(1);
        });
    });
});
