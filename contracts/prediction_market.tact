import "@stdlib/deploy";
import "@stdlib/ownable";

// Constants
const MINIMUM_BET: Int = ton("0.1");
const HOUSE_FEE_PERCENT: Int = 2;

message(0x1234) CreateMarket {
    id: Int;
    description: Cell;
    predictionX: Cell;
    predictionY: Cell;
    endTime: Int;
}

message(0x2345) PlaceBet {
    marketId: Int;
    prediction: Int;
}

message(0x3456) CloseMarket {
    marketId: Int;
}

message(0x4567) DecideWinner {
    marketId: Int;
    winningPrediction: Int;
}

message(0x5678) ClaimReward {
    marketId: Int;
}

// Bet structure that includes both market ID and better address
struct Bet {
    marketId: Int;
    better: Address;
    amount: Int;
    prediction: Int;
    claimed: Bool;
}

// Market structure
struct Market {
    id: Int;
    description: Cell;
    predictionX: Cell;
    predictionY: Cell;
    endTime: Int;
    status: Int;
    winningPrediction: Int;
    totalPool: Int;
    poolX: Int;
    poolY: Int;
}

contract BinaryPredictionMarket with Deployable {
    const UNDECIDED: Int = 0;
    const PREDICTION_X: Int = 1;
    const PREDICTION_Y: Int = 2;
    
    const STATUS_OPEN: Int = 0;
    const STATUS_CLOSED: Int = 1;
    const STATUS_SETTLED: Int = 2;

    owner: Address;
    markets: map<Int, Market>;
    bets: map<Int, Bet>;
    nextBetId: Int;

    init(owner: Address) {
        self.owner = owner;
        self.nextBetId = 0;
    }

    fun onlyOwner() {
        require(sender() == self.owner, "Only owner can call this");
    }

    // Helper function to find a bet by market ID and better address
    fun findBet(marketId: Int, better: Address): Int? {
        let betId: Int = 0;
        while (betId < self.nextBetId) {
            let bet: Bet? = self.bets.get(betId);
            if (bet != null) {
                if (bet!!.marketId == marketId && bet!!.better == better) {
                    return betId;
                }
            }
            betId = betId + 1;
        }
        return null;
    }

    receive(msg: CreateMarket) {
        self.onlyOwner();
        require(msg.endTime > now(), "End time must be in the future");
        require(self.markets.get(msg.id) == null, "Market ID already exists");

        let market: Market = Market{
            id: msg.id,
            description: msg.description,
            predictionX: msg.predictionX,
            predictionY: msg.predictionY,
            endTime: msg.endTime,
            status: self.STATUS_OPEN,
            winningPrediction: self.UNDECIDED,
            totalPool: 0,
            poolX: 0,
            poolY: 0
        };

        self.markets.set(msg.id, market);
    }

    receive(msg: PlaceBet) {
        let amount: Int = context().value;
        require(amount >= MINIMUM_BET, "Bet amount too low");

        let market: Market = self.markets.get(msg.marketId)!!;
        require(market.status == self.STATUS_OPEN, "Market not open");
        require(now() < market.endTime, "Market ended");
        require((msg.prediction == self.PREDICTION_X) || (msg.prediction == self.PREDICTION_Y), "Must choose X or Y");

        require(self.findBet(msg.marketId, sender()) == null, "Already bet on this market");

        let bet: Bet = Bet{
            marketId: msg.marketId,
            better: sender(),
            amount: amount,
            prediction: msg.prediction,
            claimed: false
        };

        self.bets.set(self.nextBetId, bet);
        self.nextBetId = self.nextBetId + 1;

        if (msg.prediction == self.PREDICTION_X) {
            market.poolX += amount;
        } else {
            market.poolY += amount;
        }
        market.totalPool += amount;
        self.markets.set(msg.marketId, market);
    }

    receive(msg: CloseMarket) {
        self.onlyOwner();
        let market: Market = self.markets.get(msg.marketId)!!;
        require(market.status == self.STATUS_OPEN, "Market not open");

        market.status = self.STATUS_CLOSED;
        self.markets.set(msg.marketId, market);
    }

    receive(msg: DecideWinner) {
        self.onlyOwner();
        let market: Market = self.markets.get(msg.marketId)!!;
        require(market.status == self.STATUS_CLOSED, "Market not closed");
        require((msg.winningPrediction == self.PREDICTION_X) || (msg.winningPrediction == self.PREDICTION_Y), "Must choose X or Y as winner");

        market.status = self.STATUS_SETTLED;
        market.winningPrediction = msg.winningPrediction;
        self.markets.set(msg.marketId, market);
    }

    receive(msg: ClaimReward) {
        let market: Market = self.markets.get(msg.marketId)!!;
        require(market.status == self.STATUS_SETTLED, "Market not settled");

        let betId: Int? = self.findBet(msg.marketId, sender());
        require(betId != null, "No bet found");
        
        let bet: Bet = self.bets.get(betId!!)!!;
        require(!bet.claimed, "Reward already claimed");
        require(bet.prediction == market.winningPrediction, "Did not bet on winning prediction");

        let winningPool: Int = market.winningPrediction == self.PREDICTION_X ? market.poolX : market.poolY;
        let reward: Int = (bet.amount * market.totalPool) / winningPool;
        
        let feeAmount: Int = (reward * HOUSE_FEE_PERCENT) / 100;
        reward -= feeAmount;

        bet.claimed = true;
        self.bets.set(betId!!, bet);
        
        send(SendParameters{
            to: sender(),
            value: reward,
            mode: SendIgnoreErrors
        });
    }

    get fun markets(): map<Int, Market> {
        return self.markets;
    }

    get fun bets(): map<Int, Bet> {
        return self.bets;
    }

    get fun getMarket(marketId: Int): Market? {
        return self.markets.get(marketId);
    }

    get fun getBet(marketId: Int, better: Address): Bet? {
        let betId: Int? = self.findBet(marketId, better);
        if (betId != null) {
            return self.bets.get(betId!!);
        }
        return null;
    }

    get fun getPredictionPool(marketId: Int, prediction: Int): Int {
        let market: Market = self.markets.get(marketId)!!;
        return prediction == self.PREDICTION_X ? market.poolX : market.poolY;
    }
}