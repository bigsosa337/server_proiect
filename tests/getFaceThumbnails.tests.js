import request from 'supertest';
import { expect } from 'chai';
import app from '../app.js';

describe('POST /getFaceThumbnails', () => {
    it('should return 400 if no image file is uploaded', async () => {
        const response = await request(app)
            .post('/getFaceThumbnails')
            .send();

        expect(response.status).to.equal(400);
        expect(response.body.error).to.equal('No image file uploaded.');
    });
});
