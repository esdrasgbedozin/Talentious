import { CV_RENDER_PACKAGE } from './index';

describe('@talentious/cv-render — point d\'entrée (échafaudage M0-T06)', () => {
  it('expose l\'identité du package partagé', () => {
    expect(CV_RENDER_PACKAGE.name).toBe('@talentious/cv-render');
  });

  it('déclare les cibles de consommation (aperçu Next + export-service)', () => {
    expect(CV_RENDER_PACKAGE.consumers).toEqual(['next-preview', 'export-service']);
  });
});
