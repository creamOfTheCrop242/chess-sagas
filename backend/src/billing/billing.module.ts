import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { CreditService } from './credit.service';

@Module({
  imports: [AuthModule],
  controllers: [BillingController],
  providers: [BillingService, CreditService],
  exports: [BillingService, CreditService],
})
export class BillingModule {}
