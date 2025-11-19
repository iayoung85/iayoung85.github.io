# Python Plaid Frontend

A web application that allows users to securely connect their bank accounts using Plaid Link and view their transactions.

## Overview

This application demonstrates the complete Plaid integration flow:

1. **User Connection**: User visits the website and clicks "Connect Bank"
2. **Plaid Link**: User is presented with Plaid Link to select their institution
3. **Authorization**: User authorizes the institution to send info to Plaid, generating an auth token
4. **Token Exchange**: Backend server exchanges the auth token for a permanent access token
5. **Transaction Retrieval**: Server uses the access token to fetch transactions

## Features

- 🏦 Secure bank account connection via Plaid Link
- 🔐 OAuth-style token exchange flow
- 💰 Transaction history retrieval
- 🎨 Modern, responsive UI
- 🚀 Easy setup and deployment

## Prerequisites

- Python 3.7 or higher
- A Plaid account (sign up at [https://plaid.com](https://plaid.com))
- Plaid API credentials (Client ID and Secret)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/iayoung85/Python_Plaid_Frontend.git
cd Python_Plaid_Frontend
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Set up environment variables:
```bash
cp .env.example .env
```

4. Edit `.env` and add your Plaid credentials:
```
PLAID_CLIENT_ID=your_client_id_here
PLAID_SECRET=your_secret_here
PLAID_ENV=sandbox
```

## Getting Plaid Credentials

1. Sign up for a free Plaid account at [https://dashboard.plaid.com/signup](https://dashboard.plaid.com/signup)
2. Navigate to the [Team Settings → Keys](https://dashboard.plaid.com/developers/keys) page
3. Copy your `client_id` and `sandbox` secret
4. Paste them into your `.env` file

## Usage

1. Start the Flask server:
```bash
python app.py
```

2. Open your browser and navigate to:
```
http://localhost:5000
```

3. Click the "Connect Bank" button

4. In Plaid Link (sandbox mode), you can use these test credentials:
   - Username: `user_good`
   - Password: `pass_good`
   - Select any institution from the list

5. After successful connection, click "View Transactions" to see your transaction history

## API Endpoints

### POST `/api/create_link_token`
Creates a link token for initializing Plaid Link.

**Response:**
```json
{
  "link_token": "link-sandbox-xxx"
}
```

### POST `/api/exchange_public_token`
Exchanges a public token for an access token.

**Request:**
```json
{
  "public_token": "public-sandbox-xxx"
}
```

**Response:**
```json
{
  "access_token": "access-sandbox-xxx",
  "item_id": "item-xxx",
  "message": "Successfully connected bank account"
}
```

### GET `/api/transactions`
Retrieves transactions for all connected accounts (last 30 days).

**Response:**
```json
{
  "accounts": [
    {
      "item_id": "item-xxx",
      "transactions": [
        {
          "transaction_id": "xxx",
          "name": "Transaction Name",
          "amount": 10.00,
          "date": "2025-11-19",
          "category": ["Transfer", "Debit"]
        }
      ]
    }
  ],
  "total_transactions": 25
}
```

## Project Structure

```
Python_Plaid_Frontend/
├── app.py                 # Flask backend server
├── templates/
│   └── index.html        # Frontend HTML/JavaScript
├── static/               # Static files directory
├── requirements.txt      # Python dependencies
├── .env.example         # Environment variables template
├── .gitignore           # Git ignore rules
└── README.md            # This file
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PLAID_CLIENT_ID` | Your Plaid client ID | Yes |
| `PLAID_SECRET` | Your Plaid secret key | Yes |
| `PLAID_ENV` | Plaid environment (sandbox/development/production) | Yes |

## Development vs Production

### Sandbox Mode (Development)
- Use `PLAID_ENV=sandbox` in your `.env` file
- Test credentials: username `user_good`, password `pass_good`
- No real bank connections
- Free to use

### Production Mode
- Use `PLAID_ENV=production` in your `.env` file
- Use your production secret key
- Real bank connections
- Requires Plaid production approval

## Security Notes

⚠️ **Important**: This is a demonstration application. For production use:

1. **Never commit `.env` files** - Use environment variables or secret management
2. **Use a proper database** - Current implementation stores tokens in memory
3. **Add authentication** - Implement user authentication and authorization
4. **Use HTTPS** - Always use SSL/TLS in production
5. **Add error handling** - Implement comprehensive error handling
6. **Add logging** - Log all API interactions for debugging and auditing

## Troubleshooting

### "Failed to create link token"
- Check that your Plaid credentials are correct in `.env`
- Ensure you're using the correct environment (sandbox/development/production)
- Verify your Plaid account is active

### "No bank accounts connected"
- Complete the bank connection flow before trying to fetch transactions
- Check browser console for JavaScript errors

### "Failed to fetch transactions"
- Ensure you've successfully connected a bank account
- Check that the access token was stored correctly
- Verify your Plaid credentials have transaction access

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is open source and available under the MIT License.

## Resources

- [Plaid Documentation](https://plaid.com/docs/)
- [Plaid Quickstart](https://github.com/plaid/quickstart)
- [Flask Documentation](https://flask.palletsprojects.com/)

## Support

For issues related to:
- **This application**: Open an issue on GitHub
- **Plaid API**: Contact [Plaid Support](https://plaid.com/contact/)
- **Flask**: Check [Flask Documentation](https://flask.palletsprojects.com/)
