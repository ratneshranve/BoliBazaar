const ID = /^[a-f0-9]{24}$/;

/** Auction pages join a room to get live bids, extensions and the end. The feed is public (no identities in it). */
export const registerAuctionSocket = (socket) => {
  socket.on('auction:watch', ({ auctionId } = {}) => {
    if (ID.test(String(auctionId))) socket.join(`auction:${auctionId}`);
  });
  socket.on('auction:unwatch', ({ auctionId } = {}) => {
    if (ID.test(String(auctionId))) socket.leave(`auction:${auctionId}`);
  });
};
