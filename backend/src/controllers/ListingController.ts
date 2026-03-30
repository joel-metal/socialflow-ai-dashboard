import { Request, Response } from 'express';
import { listingService } from '../services/ListingService';
import { parsePageLimit, buildPageResponse } from '../utils/pagination';

export const toggleListingVisibility = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const mentorId = (req as any).user?.id || req.body.mentorId;
    const orgId: string | undefined = (req as any).user?.organizationId;

    if (isActive === undefined) {
      return res.status(400).json({ success: false, message: 'isActive is required' });
    }

    if (!mentorId) {
      return res.status(401).json({ success: false, message: 'Unauthorized: Missing mentor ID' });
    }

    const updatedListing = await listingService.toggleVisibility(id, mentorId, isActive, orgId);

    res.json({
      success: true,
      message: `Listing visibility toggled. State: ${isActive ? 'Active' : 'Inactive'}`,
      data: updatedListing,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const searchListings = async (req: Request, res: Response) => {
  try {
    const query = (req.query.q as string) || '';
    const params = parsePageLimit(req);
    const orgId: string | undefined = (req as any).user?.organizationId;
    const { data, total } = await listingService.searchListings(query, params, orgId);

    res.json(buildPageResponse(req, data, total, params));
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
