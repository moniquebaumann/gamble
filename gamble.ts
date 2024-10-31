import { config } from 'dotenv';
import { Network } from '@dydxprotocol/v4-client-js/build/src/clients/constants';
import { IndexerClient } from '@dydxprotocol/v4-client-js/build/src/clients/indexer-client';
import {
    CompositeClient,
    BECH32_PREFIX,
    LocalWallet,
    OrderFlags,
    SubaccountClient,
    OrderSide,
    OrderType,
    OrderExecution,
    OrderTimeInForce,
} from '@dydxprotocol/v4-client-js';

export class Gambler {

    private static instance: Gambler
    public static getInstance(address: string, mnemonic: string, compositeClient: any): Gambler {
        if (Gambler.instance === undefined) {
            Gambler.instance = new Gambler(address, mnemonic, compositeClient)
        }
        return Gambler.instance
    }

    private roundCounter
    private networkType
    private address
    private mnemonic
    private indexerClient
    private compositeClient

    private constructor(address: string, mnemonic: string, compositeClient: any) {

        this.roundCounter = 0
        this.networkType = "mainnet"
        this.address = address
        this.mnemonic = mnemonic
        this.indexerClient = new IndexerClient(Network.mainnet().indexerConfig)
        this.compositeClient = compositeClient
    }

    public gamble() {
        setInterval(async () => {
            await this.playRound()
        }, 18 * 1000)
    }

    private async playRound() {
        this.roundCounter++
        const response = await this.indexerClient.account.getSubaccounts(this.address);

        console.log(`equity: ${response.subaccounts[0].equity} at round number ${this.roundCounter}`)
        const freeCollateralPercentage = (response.subaccounts[0].freeCollateral * 100) / response.subaccounts[0].equity
        console.log(`free collateral percentage: ${freeCollateralPercentage}`)


        try {
            const response = await this.indexerClient.account.getSubaccountPerpetualPositions(this.address, 0);
            const positions = response.positions;
            for (const position of positions) {
                if (position.closedAt === null) {
                    const wallet = await LocalWallet.fromMnemonic(this.mnemonic, BECH32_PREFIX);
                    const subaccount = new SubaccountClient(wallet, 0);
                    try {
                        await this.optimizePosition(position, subaccount, freeCollateralPercentage)

                    } catch (error: any) {
                        console.log(error.message);
                    }


                }
            }
        } catch (error: any) {
            console.log(error.message);
        }

    }

    private async optimizePosition(position: any, subaccount: any, freeCollateralPercentage: number) {

        const marketData = (await this.indexerClient.markets.getPerpetualMarkets(position.market)).markets[position.market];
        const clientId = `${this.roundCounter}-${position.market}`; // set to a number, can be used by the client to identify the order
        const market = position.market;
        const size = marketData.stepSize;
        let type = OrderType.MARKET; // OrderType[orderParams.type as keyof typeof OrderType]; // order type
        let timeInForce = OrderTimeInForce.GTT // OrderTimeInForce[orderParams.timeInForce as keyof typeof OrderTimeInForce];
        let goodTilTimeInSeconds1 = OrderTimeInForce.IOC //  (timeInForce === OrderTimeInForce.GTT) ? 350 : 0;
        let execution = OrderExecution.DEFAULT;
        let side
        let price

        if (position.unrealizedPnl > 8 && Math.abs(position.size) > marketData.stepSize) {
            console.log(`taking profits with ${position.market}`)
            side = (position.side === "SHORT") ? OrderSide.BUY : OrderSide.SELL
            price = (side === OrderSide.BUY) ? marketData.oraclePrice * 1.01 : marketData.oraclePrice * 0.99
        } else if (position.unrealizedPnl < -8 && (freeCollateralPercentage < 45 || freeCollateralPercentage > 55)) {
            console.log(`increasing the exposure for position ${position.market}`)
            side = (position.side === "SHORT") ? OrderSide.SELL : OrderSide.BUY
            price = (side === OrderSide.BUY) ? marketData.oraclePrice * 1.01 : marketData.oraclePrice * 0.99
            goodTilTimeInSeconds1 = OrderTimeInForce.GTT
        } else {
            console.log(`not doing anything with ${position.market} atm`)
            return
        }

        await this.compositeClient.placeOrder(
            subaccount,
            market,
            type,
            side,
            price,
            size,
            clientId,
            timeInForce,
            goodTilTimeInSeconds1,
            execution,
        );

        await this.sleep(9000)
        // console.log(`**Order Tx** ${tx.toString()}`);

    }

    private sleep(ms: number) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }

}

config()

setTimeout(async () => {
    const compositeClient = await CompositeClient.connect(Network.mainnet());
    Gambler.getInstance(process.env.ADDRESS as string, process.env.MNEMONIC as string, compositeClient).gamble()

}, 1)
