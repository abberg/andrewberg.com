var fs = require('fs');

// destination.txt will be created or overwritten by default.
fs.copyFile('../src/index.html', '../public/index.html', (err) => {
    if (err) throw err;
    console.log('index was copied');
});
