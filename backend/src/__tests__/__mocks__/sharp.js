const sharp = () => ({ resize: () => sharp(), toFormat: () => sharp(), toBuffer: async () => Buffer.from(''), toFile: async () => ({}) });
sharp.default = sharp;
module.exports = sharp;
