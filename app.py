import os
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
import plaid
from plaid.api import plaid_api
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
from plaid.model.transactions_get_request import TransactionsGetRequest
from plaid.model.products import Products
from plaid.model.country_code import CountryCode
from datetime import datetime, timedelta

# Load environment variables
load_dotenv()

app = Flask(__name__, static_folder='static', template_folder='templates')

# Plaid configuration
PLAID_CLIENT_ID = os.getenv('PLAID_CLIENT_ID')
PLAID_SECRET = os.getenv('PLAID_SECRET')
PLAID_ENV = os.getenv('PLAID_ENV', 'sandbox')

# Map environment to Plaid host
PLAID_ENV_URLS = {
    'sandbox': plaid.Environment.Sandbox,
    'development': plaid.Environment.Development,
    'production': plaid.Environment.Production,
}

# Initialize Plaid client
configuration = plaid.Configuration(
    host=PLAID_ENV_URLS.get(PLAID_ENV, plaid.Environment.Sandbox),
    api_key={
        'clientId': PLAID_CLIENT_ID,
        'secret': PLAID_SECRET,
    }
)

api_client = plaid.ApiClient(configuration)
client = plaid_api.PlaidApi(api_client)

# Store access tokens (in production, use a proper database)
access_tokens = {}


@app.route('/')
def index():
    """Serve the main page"""
    return render_template('index.html')


@app.route('/api/create_link_token', methods=['POST'])
def create_link_token():
    """
    Create a link token for Plaid Link initialization
    This is step 1 of the Plaid flow
    """
    try:
        request_data = LinkTokenCreateRequest(
            user=LinkTokenCreateRequestUser(
                client_user_id='user-id'
            ),
            client_name='Plaid Python Frontend',
            products=[Products('transactions')],
            country_codes=[CountryCode('US')],
            language='en'
        )
        
        response = client.link_token_create(request_data)
        return jsonify({'link_token': response['link_token']})
    except plaid.ApiException as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/exchange_public_token', methods=['POST'])
def exchange_public_token():
    """
    Exchange a public token for an access token
    This is step 2 of the Plaid flow, called after user completes Link
    """
    try:
        public_token = request.json.get('public_token')
        
        if not public_token:
            return jsonify({'error': 'public_token is required'}), 400
        
        exchange_request = ItemPublicTokenExchangeRequest(
            public_token=public_token
        )
        
        exchange_response = client.item_public_token_exchange(exchange_request)
        access_token = exchange_response['access_token']
        item_id = exchange_response['item_id']
        
        # Store the access token (in production, use a proper database)
        access_tokens[item_id] = access_token
        
        return jsonify({
            'access_token': access_token,
            'item_id': item_id,
            'message': 'Successfully connected bank account'
        })
    except plaid.ApiException as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/transactions', methods=['GET'])
def get_transactions():
    """
    Get transactions for all connected accounts
    This demonstrates using the access token to fetch data
    """
    try:
        if not access_tokens:
            return jsonify({'error': 'No bank accounts connected'}), 400
        
        all_transactions = []
        
        # Get transactions for each connected account
        for item_id, access_token in access_tokens.items():
            # Get transactions for the last 30 days
            start_date = (datetime.now() - timedelta(days=30)).date()
            end_date = datetime.now().date()
            
            request_data = TransactionsGetRequest(
                access_token=access_token,
                start_date=start_date,
                end_date=end_date
            )
            
            response = client.transactions_get(request_data)
            transactions = response['transactions']
            
            all_transactions.append({
                'item_id': item_id,
                'transactions': [
                    {
                        'transaction_id': t['transaction_id'],
                        'name': t['name'],
                        'amount': t['amount'],
                        'date': str(t['date']),
                        'category': t.get('category', [])
                    }
                    for t in transactions
                ]
            })
        
        return jsonify({
            'accounts': all_transactions,
            'total_transactions': sum(len(a['transactions']) for a in all_transactions)
        })
    except plaid.ApiException as e:
        return jsonify({'error': str(e)}), 400


if __name__ == '__main__':
    app.run(debug=True, port=5000)
