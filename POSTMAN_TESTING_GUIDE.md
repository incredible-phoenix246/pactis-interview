# Pactis API Postman Testing Guide

This guide explains how to use the provided Postman collection to test the Pactis wallet API.

## Files Included

- `Pactis_API_Collection.postman_collection.json` - Main Postman collection
- `Pactis_Local_Environment.postman_environment.json` - Environment variables for local testing

## Setup Instructions

1. **Import the Collection**
   - Open Postman
   - Click "Import" in the top left
   - Select `Pactis_API_Collection.postman_collection.json`
   - The collection will appear in your workspace

2. **Import the Environment**
   - Click the gear icon (⚙️) in the top right to manage environments
   - Click "Import" and select `Pactis_Local_Environment.postman_environment.json`
   - Select the "Pactis Local Environment" from the environment dropdown

3. **Ensure Your Server is Running**
   ```bash
   pnpm run start:dev
   ```
   The server should be running on `http://localhost:5000`

## Collection Structure

### 1. Authentication
- **Health Check** - Test server connectivity
- **Register User** - Create a new user account (automatically saves JWT token)
- **Login User** - Authenticate existing user (automatically saves JWT token)

### 2. Wallet Management
- **Get User Wallets** - Retrieve all wallets for authenticated user
- **Create Wallet** - Create a new wallet with specified currency
- **Get Wallet Balance** - Check balance of a specific wallet

### 3. Transactions
- **Deposit Funds** - Add money to a wallet
- **Withdraw Funds** - Remove money from a wallet
- **Transfer Between Wallets** - Move money between user's wallets
- **Get Transaction History** - View transaction history (currently has validation issues)

### 4. Test Scenarios
- **Test Idempotency** - Verify duplicate transaction prevention
- **Test Invalid Amount** - Validate negative amount rejection
- **Test Invalid Wallet ID** - Test UUID validation
- **Test Insufficient Funds** - Verify withdrawal limits

### 5. Error Testing
- **Test Unauthorized Request** - Verify authentication requirements
- **Test Invalid Token** - Test JWT validation
- **Test Weak Password** - Verify password strength requirements

## How to Use

### Basic Workflow

1. **Start with Authentication**
   - Run "Health Check" to ensure server is accessible
   - Run "Register User" to create a new account (or use "Login User" if account exists)
   - The JWT token will be automatically saved to the `accessToken` variable

2. **Test Wallet Operations**
   - Run "Get User Wallets" to see default wallet (created during registration)
   - Run "Create Wallet" to create a second wallet
   - Wallet IDs are automatically saved to variables

3. **Test Transactions**
   - Run "Deposit Funds" to add money to your wallet
   - Wait a few seconds for queue processing
   - Run "Get Wallet Balance" to see updated balance
   - Try "Withdraw Funds" and "Transfer Between Wallets"

### Automatic Variable Management

The collection includes scripts that automatically:
- Save JWT tokens after login/registration
- Save wallet IDs after wallet creation
- Save transaction IDs after transactions
- Generate unique idempotency keys using `{{$randomUUID}}`

### Environment Variables

| Variable | Description | Auto-populated |
|----------|-------------|----------------|
| `baseUrl` | API base URL | ✓ |
| `userEmail` | Test user email | ✓ |
| `userPassword` | Test user password | ✓ |
| `accessToken` | JWT authentication token | Yes (after login) |
| `userId` | Current user ID | Yes (after login) |
| `walletId` | Primary wallet ID | Yes (after wallet fetch) |
| `secondWalletId` | Secondary wallet ID | Yes (after wallet creation) |

## Testing Tips

1. **Sequential Testing**
   - Run requests in order within each folder
   - Authentication requests should be run first
   - Wallet creation before transaction testing

2. **Queue Processing**
   - Deposit/withdrawal/transfer operations are queued
   - Wait 2-3 seconds after transactions before checking balances
   - Transactions start as "PENDING" and become "COMPLETED" after processing

3. **Idempotency Testing**
   - Run the same idempotency test twice to verify duplicate prevention
   - Each request generates a unique idempotency key by default

4. **Error Scenarios**
   - Test error conditions to verify proper validation
   - Check response status codes and error messages

## Known Issues

1. **Transaction History Endpoint**
   - Currently has validation issues with query parameters
   - Request works but requires fixing the DTO validation configuration

2. **Token Expiration**
   - JWT tokens expire after 1 hour
   - Re-run "Login User" if you get 401 Unauthorized errors

## Response Examples

### Successful Login Response
```json
{
    "data": {
        "access_token": "eyJhbGciOiJIUzI1NiIs...",
        "token_type": "Bearer",
        "expires_in": 3600,
        "user": {
            "id": "f6aa5b47-82a0-4497-90f1-771182e78f08",
            "email": "testuser@example.com",
            "first_name": "John",
            "last_name": "Doe"
        }
    },
    "message": "User logged in successfully"
}
```

### Successful Deposit Response
```json
{
    "data": {
        "transaction_id": "5a053c9e-6bdc-4b9c-981d-6a373ae7a7ac",
        "to_wallet_id": "eb6575a8-dabd-4741-b39e-be21ab6f13e3",
        "amount": "100",
        "type": "DEPOSIT",
        "status": "PENDING",
        "description": "Test deposit via Postman"
    },
    "message": "Deposit initiated successfully"
}
```

## Troubleshooting

1. **Connection Refused**
   - Ensure the server is running on port 5000
   - Check that there are no other processes using the port

2. **Authentication Errors**
   - Verify the JWT token is properly set in the environment
   - Re-run the login request if token has expired

3. **Validation Errors**
   - Check request body format matches the expected schema
   - Ensure all required fields are included

4. **Database Errors**
   - Verify PostgreSQL is running and accessible
   - Check that database migrations have been applied

## Support

If you encounter issues not covered in this guide:
1. Check the server logs in the terminal
2. Use Postman's console to view detailed request/response information
3. Verify all environment variables are properly set