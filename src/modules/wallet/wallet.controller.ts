import {
  Controller,
  Post,
  Get,
  Query,
  UseGuards,
  Request,
  Body,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { WalletService } from './services/wallet.service';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { DepositDto } from './dto/deposit.dto';
import { WithdrawDto } from './dto/withdraw.dto';
import { TransferDto } from './dto/transfer.dto';


import type { TransactionHistoryDto } from './dto/transaction-history.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import type { User } from '@database/entities/user.entity';
import { Wallet } from '@database/entities/wallet.entity';
import { Transaction } from '@database/entities/transaction.entity';
import { buildResponse } from '@helpers/format-response';

@ApiTags('Wallet Operations')
@Controller('wallets')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WalletController {
  constructor(private readonly walletService: WalletService) { }

  @Post()
  @ApiOperation({ summary: 'Create a new wallet' })
  @ApiBody({ type: CreateWalletDto })
  @ApiResponse({
    status: 201,
    description: 'Wallet created successfully',
    type: Wallet,
  })
  @ApiResponse({
    status: 409,
    description: 'User already has a wallet with this currency',
  })
  async createWallet(
    @Body() createWalletDto: CreateWalletDto,
    @Request() req: { user: User },
  ) {
    const wallet = await this.walletService.createWallet(
      req.user.id,
      createWalletDto,
    );
    return buildResponse(wallet, 'Wallet created successfully');
  }

  @Get()
  @ApiOperation({ summary: 'Get user wallets' })
  @ApiResponse({
    status: 200,
    description: 'User wallets retrieved successfully',
    type: [Wallet],
  })
  async getUserWallets(@Request() req: { user: User }) {
    const wallets = await this.walletService.getUserWallets(req.user.id);
    return buildResponse(wallets, 'User wallets retrieved successfully');
  }

  @Get('balance')
  @ApiOperation({ summary: 'Get wallet balance' })
  @ApiQuery({ name: 'wallet_id', description: 'Wallet ID', type: String })
  @ApiResponse({
    status: 200,
    description: 'Wallet balance retrieved successfully',
  })
  async getWalletBalance(@Query('wallet_id') walletId: string) {
    const balance = await this.walletService.getWalletBalance(walletId);
    return buildResponse(
      { balance: balance.toString() },
      'Wallet balance retrieved successfully',
    );
  }

  @Post('deposit')
  @ApiOperation({ summary: 'Deposit funds into a wallet' })
  @ApiBody({ type: DepositDto })
  @ApiResponse({
    status: 201,
    description: 'Deposit initiated successfully',
    type: Transaction,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid deposit request',
  })
  async deposit(@Body() depositDto: DepositDto) {
    const transaction = await this.walletService.deposit(depositDto);
    return buildResponse(transaction, 'Deposit initiated successfully');
  }

  @Post('withdraw')
  @ApiOperation({ summary: 'Withdraw funds from a wallet' })
  @ApiBody({ type: WithdrawDto })
  @ApiResponse({
    status: 201,
    description: 'Withdrawal initiated successfully',
    type: Transaction,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid withdrawal request or insufficient funds',
  })
  async withdraw(@Body() withdrawDto: WithdrawDto) {
    const transaction = await this.walletService.withdraw(withdrawDto);
    return buildResponse(transaction, 'Withdrawal initiated successfully');
  }

  @Post('transfer')
  @ApiOperation({ summary: 'Transfer funds between wallets' })
  @ApiBody({ type: TransferDto })
  @ApiResponse({
    status: 201,
    description: 'Transfer initiated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid transfer request or insufficient funds',
  })
  async transfer(@Body() transferDto: TransferDto) {
    const transactions = await this.walletService.transfer(transferDto);
    return buildResponse(transactions, 'Transfer initiated successfully');
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Get transaction history for a wallet' })
  @ApiResponse({
    status: 200,
    description: 'Transaction history retrieved successfully',
  })
  async getTransactionHistory(@Query() historyDto: TransactionHistoryDto) {
    const result = await this.walletService.getTransactionHistory(historyDto);
    return buildResponse(
      result.payload,
      'Transaction history retrieved successfully',
      result.paginationMeta,
    );
  }
}
