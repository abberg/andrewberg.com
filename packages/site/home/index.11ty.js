class Test {
  // or `async data() {`
  // or `get data() {`
  data() {
    return {
      permalink: '/index.html',
    };
  }

  render({ collections }) {
    return `<!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="preconnect" href="https://fonts.gstatic.com">
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jura&display=swap">
        <link rel="stylesheet" href="styles.css" />
        <title>Andrew Berg</title>
      </head>
      <body>
        <header>
          Andrew Berg
        </header>
        <main>
          <nav>
            <ul>
              ${collections.pages
                .map(
                  (page) =>
                    `<li>
                      <a href="/${page}">
                        <img src="/${page}/thumbnail.png" alt="thumbail">
                        <span>${page}</span>
                      </a>
                    </li>`
                )
                .reduce((acc, cur) => acc + cur)}
            </ul>
          </nav>
        </main>
      </body>
    </html>
    `;
  }
}

module.exports = Test;
