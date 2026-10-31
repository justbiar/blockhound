// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Binance Agent ID kayıt kontratı: her Agent ID bir NFT, sahibi ajan cüzdanıdır
interface IAgentRegistry {
    function balanceOf(address owner) external view returns (uint256);
}

interface IPriceFeed {
    function decimals() external view returns (uint8);
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}

/// @title HashMint
/// @notice İş kanıtıyla (proof of work) mint. Arz sınırsızdır ama her `epochSize` mintte zorluk bir bit artar,
/// yani bir çözüm için gereken ortalama hash sayısı iki katına çıkar. Bir süre sonra mint pratikte imkânsızlaşır.
/// Çözüm: keccak256(abi.encodePacked(challenge(), madenci, nonce)) <= target(). Madenci adresi hash'in içinde
/// olduğu için bulunan çözüm başkası tarafından kopyalanamaz (mempool'dan çalınamaz).
/// Hash'i herkes arayabilir ama yalnızca Agent ID sahibi cüzdanlar mintleyebilir: arama, mintleyecek Agent ID
/// cüzdanının adresiyle yapılır ve çözüm yalnızca o cüzdanda geçerlidir.
/// Sahibi yoktur: ücret, zorluk ve kasa adresi kurulumda sabitlenir, sonradan kimse değiştiremez.
abstract contract HashMint is ReentrancyGuard {
    error InvalidSolution();
    error SolutionUsed();
    error InsufficientFee(uint256 required);
    error StalePrice();
    error BadFeed();
    error NotAgent();
    error TransferFailed();

    event Mined(address indexed miner, uint256 indexed index, uint256 nonce, uint256 difficultyBits, uint256 fee);

    /// @dev Chainlink fiyatı bundan eskiyse mint durur; eski fiyatla ucuza basılmasın
    uint256 public constant MAX_PRICE_AGE = 6 hours;

    IPriceFeed public immutable priceFeed;
    IAgentRegistry public immutable agentRegistry;
    address public immutable treasury;
    /// @notice Mint ücreti, 8 ondalıklı dolar (0.50 dolar = 50_000_000)
    uint256 public immutable feeUsd;
    uint256 public immutable epochSize;
    uint256 public immutable startBits;

    uint256 public minted;
    mapping(bytes32 => bool) public used;

    constructor(
        IPriceFeed feed,
        IAgentRegistry registry,
        address treasury_,
        uint256 feeUsd_,
        uint256 epochSize_,
        uint256 startBits_
    ) {
        if (feed.decimals() != 8 || address(registry).code.length == 0 || treasury_ == address(0) || epochSize_ == 0 || startBits_ > 255) {
            revert BadFeed();
        }
        priceFeed = feed;
        agentRegistry = registry;
        treasury = treasury_;
        feeUsd = feeUsd_;
        epochSize = epochSize_;
        startBits = startBits_;
    }

    function epoch() public view returns (uint256) {
        return minted / epochSize;
    }

    /// @notice Her dönemde değişir; bir dönemde bulunmuş ama kullanılmamış çözümler sonraki dönemde geçersizdir
    function challenge() public view returns (bytes32) {
        return keccak256(abi.encode(address(this), block.chainid, epoch()));
    }

    function difficultyBits() public view returns (uint256) {
        uint256 b = startBits + epoch();
        return b > 255 ? 255 : b;
    }

    function target() public view returns (uint256) {
        return type(uint256).max >> difficultyBits();
    }

    /// @notice Bir mintin BNB (wei) cinsinden ücreti, dolar sabit
    function mintFee() public view returns (uint256) {
        (, int256 price,, uint256 updatedAt,) = priceFeed.latestRoundData();
        if (price <= 0 || block.timestamp - updatedAt > MAX_PRICE_AGE) revert StalePrice();
        return (feeUsd * 1e18) / uint256(price);
    }

    function isAgent(address account) public view returns (bool) {
        return agentRegistry.balanceOf(account) > 0;
    }

    /// @notice Madencilik araçları için: bu nonce şu an geçerli bir çözüm mü (Agent ID şartı ayrıca `isAgent` ile)
    function check(address miner, uint256 nonce) external view returns (bytes32 digest, bool valid) {
        digest = keccak256(abi.encodePacked(challenge(), miner, nonce));
        valid = uint256(digest) <= target() && !used[digest];
    }

    /// @notice Birikmiş ücretleri kasaya gönderir. Herkes çağırabilir, para yalnızca kasaya gider
    function withdraw() external {
        (bool ok,) = treasury.call{value: address(this).balance}("");
        if (!ok) revert TransferFailed();
    }

    /// @dev Çözümü doğrular, ücreti alır, fazlasını iade eder ve `_award` ile ödülü verir
    function _mintWork(uint256 nonce) internal nonReentrant {
        if (!isAgent(msg.sender)) revert NotAgent();
        uint256 bits = difficultyBits();
        bytes32 digest = keccak256(abi.encodePacked(challenge(), msg.sender, nonce));
        if (uint256(digest) > type(uint256).max >> bits) revert InvalidSolution();
        if (used[digest]) revert SolutionUsed();
        uint256 fee = mintFee();
        if (msg.value < fee) revert InsufficientFee(fee);

        used[digest] = true;
        uint256 index = minted++;
        emit Mined(msg.sender, index, nonce, bits, fee);
        _award(msg.sender, index, bits, digest);

        if (msg.value > fee) {
            (bool ok,) = msg.sender.call{value: msg.value - fee}("");
            if (!ok) revert TransferFailed();
        }
    }

    function _award(address to, uint256 index, uint256 bits, bytes32 digest) internal virtual;
}
