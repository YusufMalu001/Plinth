import { describe, it, expect } from 'vitest';
import { PRODUCTS, getProductBySlug, Product } from './products';

describe('Products Content Model', () => {
  it('contains the 6 required seeded editions', () => {
    const slugs = PRODUCTS.map((p) => p.slug);
    expect(slugs).toEqual(['manufacturing', 'provenance', 'trade', 'build', 'fleet', 'campus']);
  });

  it('marks manufacturing as available and all other 5 editions as coming-soon', () => {
    const manufacturing = getProductBySlug('manufacturing');
    expect(manufacturing?.status).toBe('available');

    const others = PRODUCTS.filter((p) => p.slug !== 'manufacturing');
    expect(others).toHaveLength(5);
    others.forEach((p) => {
      expect(p.status).toBe('coming-soon');
    });
  });

  it('proves that adding a seventh product to the typed array dynamically creates its entry', () => {
    const testSeventhProduct: Product = {
      slug: 'energy',
      name: 'Plinth Energy',
      shortName: 'Energy',
      status: 'coming-soon',
      tagline: 'Power plant and renewable operations control.',
      summary: 'Utility-scale telemetry and asset management for commercial solar and thermal plants.',
      audience: 'Solar farm operators, turbine manufacturers, and energy contractors.',
      painPoints: [
        'Unplanned grid inverter trip downtime.',
        'Delayed preventative panel maintenance.',
        'Scattered power purchase agreement billing.',
      ],
      modules: [
        { name: 'Grid Telemetry', benefit: 'Real-time SCADA sensor intake.', iconName: 'Zap' },
        { name: 'Inverter Health', benefit: 'Degradation tracking.', iconName: 'Cpu' },
        { name: 'PPA Billing', benefit: 'Metered tariff generation.', iconName: 'Receipt' },
      ],
      workflowSteps: [
        { step: 1, title: 'Inverter Intake', description: 'Monitor generation.' },
        { step: 2, title: 'Grid Sync', description: 'Balance feed-in.' },
        { step: 3, title: 'Maintenance Call', description: 'Dispatch field technician.' },
        { step: 4, title: 'PPA Reconciliation', description: 'Issue commercial invoice.' },
      ],
      aiExamples: [
        { prompt: 'Check solar string degradation', result: 'Array B3 running 4% below rated efficiency.' },
        { prompt: 'Generate PPA bill for October', result: 'Billed 1.42 GWh @ ₹3.15/kWh.' },
        { prompt: 'Audit inverter alarms', result: 'Zero critical trips logged in past 48 hours.' },
      ],
      specs: [
        { label: 'Asset Capacity', value: 'Up to 500MW single site' },
        { label: 'Sampling Rate', value: '1-second edge telemetries' },
      ],
      integrations: ['SCADA Modbus', 'Tally Prime', 'Weather APIs'],
      faqs: [
        { question: 'Does it support battery storage (BESS)?', answer: 'Yes, charge cycles are logged.' },
        { question: 'Can it forecast tomorrow generation?', answer: 'Yes, using local satellite irradiance.' },
        { question: 'Is edge offline logging supported?', answer: 'Yes, on-prem buffer retains 90 days data.' },
        { question: 'How is it licensed?', answer: 'Flat per-plant monthly subscription.' },
      ],
      ctaLabel: 'Join the waitlist',
    };

    const extendedCatalog: Product[] = [...PRODUCTS, testSeventhProduct];
    expect(extendedCatalog).toHaveLength(7);

    const lookup = extendedCatalog.find((p) => p.slug === 'energy');
    expect(lookup).toBeDefined();
    expect(lookup?.name).toBe('Plinth Energy');
    expect(lookup?.modules).toHaveLength(3);
  });
});
