# Apify Cost Breakdown

## Pricing Model

Pay-per-result: **$0.003 per job scraped** via `openclawai~job-board-scraper` actor.

## Cost per search run

| Setting | Value | Jobs per run |
|---------|-------|-------------|
| Search terms | 5 | × |
| Boards per term | 4 (linkedin, indeed, glassdoor, naukri) | × |
| Max results per board | 20 | = |
| **Max jobs per run** | | **400** |

Actual results are usually fewer (dedup, empty boards): ~150–200 per run.

**Cost per run: ~$0.45–$0.60**

## Cost by interval

| Interval | Runs/day | Daily cost | Monthly cost |
|----------|----------|-----------|-------------|
| Every hour | 24 | ~$12 | ~$360 |
| Every 6 hours | 4 | ~$2 | ~$60 |
| Daily (9 AM UTC) | 1 | ~$0.50 | ~$15 |

## Current setting

`APIFY_INTERVAL_HOURS = 1` (every hour)

## Recommendation

For validation phase: switch to **daily** (`0 9 * * *` in GitHub Actions). Costs ~$15/month vs ~$360/month. You won't miss jobs — most boards update daily anyway.

## How to check balance

1. Go to https://console.apify.com/billing
2. Look at "Current balance" and "Usage this month"

## Free tier

New accounts get **$5 free credit** (~1,600 job scrapes). After that, add credit manually.
