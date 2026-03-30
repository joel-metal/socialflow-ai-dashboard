import { Router } from 'express';
import { toggleListingVisibility, searchListings } from '../controllers/ListingController';
import { authenticate as authMiddleware } from '../middleware/authenticate';

const router = Router();

/**
 * @openapi
 * /listings/search:
 *   get:
 *     tags: [Listings]
 *     summary: Search listings
 *     security: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search query
 *     responses:
 *       200:
 *         description: Matching listings
 */
router.get('/search', searchListings);

/**
 * @openapi
 * /listings/{id}/visibility:
 *   patch:
 *     tags: [Listings]
 *     summary: Toggle the visibility of a listing
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Visibility updated
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Listing not found
 */
router.patch('/:id/visibility', authMiddleware, toggleListingVisibility);

export default router;
