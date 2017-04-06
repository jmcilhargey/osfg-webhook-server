const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const crypto = require('crypto');
const assert = require('assert');
const request = require('request');
const fs = require('fs');
const showdown = require('showdown');
const converter = new showdown.Converter();

app.use(bodyParser.json());
app.use(express.static('public'));

app.post('/event', (req, res) => {
  if (verifySignature(req.body, req.headers) && isReadmeUpdated(req.body)) {
    const url1 = getReadmeUrl(req.body);
    const url2 = getContributorUrl(req.body);
    fetchReadmeText(url1, (text) => {
      getContributors(url2, (data) => {
        const contributors = buildContributorHtml(data);
        const body = converter.makeHtml(text);
        const name = req.body.repository.name;
        const page = buildPage(name, body, contributors);
        writeHtmlFile(page);
        const encoded = base64EncodeString(page);
        pushFileToRepo(encoded, name);
      })
    });
    console.log({ message: "README.md created or updated" });
  } else {
    console.log({ message: "POST signature doesn\'t match key" });
  }
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html');
});

const server = app.listen(process.env.PORT, () => {
  console.log('App is listening on port ' + server.address().port);
});

function verifySignature(body, headers) {
  const signature = headers['x-hub-signature'];
  const hash = `sha1=${ crypto.createHmac('sha1', process.env.WEBHOOK_KEY).update(body.toString()).digest('hex') }`;
  // TODO: Test HMAC hash
  return 1 === 1;
}

function isReadmeUpdated(body) {
  const readme = "README.md";
  for (let i = 0; i < body.commits.length; i++) {
    let commit = body.commits[i];
    for (let j = 0; j < commit.added.length; j++) {
      if (commit.added[i] === readme) {
        return true;
      }
    }
    for (let k = 0; k < commit.modified.length; k++) {
      if (commit.modified[i] === readme) {
        return true;
      }
    }
  }
  return false;
}

function getReadmeUrl(body) {
  const root = "https://raw.githubusercontent.com/";
  const repo = body.repository.full_name;
  const file = "/master/README.md";
  return root + repo + file;
}

function fetchReadmeText(url, callback) {
  request(url, (err, res, body) => {
    if (err) {
      console.log({ message: "Failed to fetch README", error: err });
    }
    if (res.statusCode === 200 && res.headers['content-type'] === "text/plain; charset=utf-8") {
      return callback(body);
    } else {
      console.log({ message: "Invalid response from GitHub request", status: res.statusCode });
    }
  });
}

function getContributorUrl(body) {
  const repo = "mail-for-good" || body.repository.name;
  return `https://api.github.com/repos/freecodecamp/${ repo }/contributors`;
}

function getContributors(url, callback) {
  const options = {
    url: url,
    headers: {
      'User-Agent': 'osfg-request'
    }
  };
  request.get(options, (err, res, body) => {
    if (res.statusCode === 200 && res.headers['content-type'] === "application/json; charset=utf-8") {
      callback(body);
    } else {
      console.log({ message: "Invalid response from GitHub request", status: res.statusCode });
    }
  });
}

function buildContributorHtml(data) {
  let contributors = [];
  try {
    contributors = JSON.parse(data);
  } catch (err) {
    console.log({ message: "JSON parse failed on contributors"});
  }
  let markup = "";
  contributors.forEach(c => {
    markup += 
    `
    <div class="contributer">    
      <a class="contributer-link" href=${ c.url }>
        <img className="contributer-img" src=${ c.avatar_url }/>
      </a>
    </div>
    `
  });
  return markup;
}
      
function buildPage(name, body, contributors) {
  return (
    `
    <!DOCTYPE html>
    <html>
      <header>
        <link rel="stylesheet" href="/style.css">
      </header>
      <body> 
        <div class="wrapper">
          <div class="fcc-banner">
            <img src="https://cdn.glitch.com/f9a9063e-4605-4536-942e-6a948a65598e%2Ffcc-logo-white.png?1491457226808"/>
          </div>
          <div class="content-container">
            <h1>${ name }</h1>
            ${ body }
            <h2>Contributors</h2>
            <div class="contributors">
              ${ contributors }
            </div>
          </div>
        </div>
      </body>
    </html>  
    `
  );
}

function writeHtmlFile(html) {
  const path = __dirname + "/views/index.html";
  fs.writeFile(path, html, 'utf-8', (err) => {
    if (err) {
      console.log({ message: "Error writing file", error: err });
    }
  });
}

function base64EncodeString(string) {
  return new Buffer(string).toString('base64');
}

function getFileSha(url, callback) {
const options = {
  url: url,
    headers: {
      'User-Agent': 'osfg-request'
    }
  };
  request.get(options, (err, res, body) => {
    if (res.statusCode === 200 && res.headers['content-type'] === "application/json; charset=utf-8") {
      try {
        const data =JSON.parse(body);
        callback(data.sha);
      } catch (err) {
        console.log({ message: "JSON parse failed on SHA"});
      }
    } else {
      callback('');
    }
  });
}

function pushFileToRepo(content, repo) {
  const url = `https://api.github.com/repos/freshcupajoe/test/contents/${ repo }/index.html`
  getFileSha(url, (sha) => {
    const options = {
      url: url,
      headers: {
        'User-Agent': 'osfg-request',
        'Authorization': 'token ' + process.env.GITHUB_TOKEN
      },
      method: 'PUT',
      json: {
        path: 'index.html',
        sha: sha,
        message: 'testing',
        committer: {
          "name": 'Joe',
          "email": 'freshcupajoe@gmail.com'
        },
        content: content,
        branch: 'master'
      }
    };
    request(options, (err, res, body) => {
      if (res.statusCode === 200) {
        console.log({ message: repo + " index.html updated" });
      } else if (res.statusCode === 201) {
        console.log({ message: repo + " index.html created" });
      } else {
        console.log({ message: "Invalid response from GitHub file creation", status: res.statusCode });
      }
    });
  });
}