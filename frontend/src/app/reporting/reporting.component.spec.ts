import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { ReportingComponent } from './reporting.component';
import { ReportingOverview } from './reporting.models';
import { ReportingClientService } from './reporting.service';

describe('ReportingComponent', () => {
    let fixture: ComponentFixture<ReportingComponent>;
    const overview = vi.fn().mockName('overview').mockReturnValue(of(reportFixture()));

    beforeEach(async () => {
        overview.mockClear();
        await TestBed.configureTestingModule({
            imports: [ReportingComponent],
            providers: [
                provideRouter([]),
                {
                    provide: AuthService,
                    useValue: { user: signal(null), loading: signal(false) },
                },
                {
                    provide: ReportingClientService,
                    useValue: { overview },
                },
            ],
        }).compileComponents();
        fixture = TestBed.createComponent(ReportingComponent);
        fixture.detectChanges();
    });

    it('renders customer margin separately from unlimited testing expense', () => {
        const text = fixture.nativeElement.textContent;
        expect(text).toContain('Customer AI cost');
        expect(text).toContain('Unlimited testing');
        expect(text).toContain('dhudson0242@gmail.com');
        expect(text).toContain('Pipeline stages');
        expect(overview).toHaveBeenCalledWith(30);
    });

    it('reloads the selected reporting window', () => {
        fixture.componentInstance.days = 90;
        fixture.componentInstance.load();
        expect(overview).toHaveBeenCalledWith(90);
    });
});

function reportFixture(): ReportingOverview {
    const group = {
        calls: 1,
        succeeded: 1,
        failed: 0,
        retryCalls: 0,
        failureRate: 0,
        averageSeconds: 10,
        inputTokens: 100,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        outputTokens: 100,
        estimatedCostMicros: 10000,
        estimatedCostUsd: 0.01,
    };
    return {
        range: { from: '2026-08-01T00:00:00Z', to: '2026-08-08T00:00:00Z' },
        summary: {
            completedSagas: 1,
            failedSagas: 0,
            sagaFailureRate: 0,
            averageGenerationSeconds: 120,
            aiCalls: 2,
            aiCallFailures: 0,
            aiFailureRate: 0,
            retryCalls: 0,
            estimatedAiCostMicros: 20000,
            estimatedAiCostUsd: 0.02,
            netRevenueCents: 250,
            estimatedGrossMarginCents: 249,
        },
        generation: {
            total: 1,
            completed: 1,
            failed: 0,
            active: 0,
            averageSeconds: 120,
            byBillingState: { CONSUMED: 1 },
            unlimitedAccounts: [],
        },
        pipeline: [
            {
                stage: 'STORY',
                attempts: 1,
                completed: 1,
                failed: 0,
                failureRate: 0,
                averageAttemptSeconds: 60,
                firstPassCompleted: 1,
                recoveredAfterRetry: 0,
                exhausted: 0,
            },
        ],
        ai: {
            total: { ...group, calls: 2, estimatedCostUsd: 0.02 },
            customer: group,
            unlimited: group,
            anonymous: { ...group, calls: 0, estimatedCostUsd: 0 },
            reused: { ...group, calls: 0, estimatedCostUsd: 0 },
            byStageModel: [{ ...group, stage: 'full-story', model: 'gpt-5.6-terra' }],
            unlimitedAccounts: [
                { ...group, email: 'dhudson0242@gmail.com' },
            ],
            byAttribution: {},
        },
        billing: {
            creditsByType: { ONE_TIME_PURCHASE: 1 },
            purchasedCredits: 1,
            consumedCredits: 1,
            refundedCredits: 0,
            grossRevenueCents: 250,
            refundedCents: 0,
            netRevenueCents: 250,
        },
        errors: [],
    };
}
