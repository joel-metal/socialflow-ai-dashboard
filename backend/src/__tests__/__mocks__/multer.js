const multer = () => ({
  single: () => (_req, _res, next) => next(),
  array: () => (_req, _res, next) => next(),
  fields: () => (_req, _res, next) => next(),
});
multer.memoryStorage = () => ({});
multer.diskStorage = () => ({});
module.exports = multer;
module.exports.default = multer;
