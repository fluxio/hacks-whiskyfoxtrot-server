Create the following .env:

```
FLUX_CLIENT_ID=client_id_here
FLUX_CLIENT_SECRET=client_secret_here
FLUX_REDIRECT_URI=http://localhost:5000/oauthcb
PORT=5000
SESSION_SECRET=session_secret_here
```

Replace client_id_here and client_secret_here with your Flux client
ID/secret.

Replace session_secret_here with some arbitrary random string.

## Running Locally

```sh
$ npm install
$ heroku local
```
