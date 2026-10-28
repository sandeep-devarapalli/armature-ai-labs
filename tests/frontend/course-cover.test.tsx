import { render } from '@testing-library/react';
import { CoverImage } from '../../course-app/CoverImage';

const base = 'https://media.armatureailabs.com/covers/v1/intro-robotics-dark';

describe('CoverImage', () => {
  it('serves the 800px file by default and offers the 1600px file to large screens', () => {
    const { container } = render(<CoverImage url={`${base}-1600.webp`} className="course-card-cover" sizes="560px" />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe(`${base}-800.webp`);
    expect(img.getAttribute('srcset')).toBe(`${base}-800.webp 800w, ${base}-1600.webp 1600w`);
    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('width')).toBe('1600');
    expect(img.getAttribute('height')).toBe('900');
    expect(img.getAttribute('loading')).toBe('lazy');
  });

  it('loads eagerly when asked, for the course page header', () => {
    const { container } = render(<CoverImage url={`${base}-1600.webp`} className="course-hero-cover" sizes="880px" eager />);
    expect(container.querySelector('img')!.getAttribute('loading')).toBe('eager');
  });

  it.each([
    [undefined], [null], [''],
    ['https://example.com/covers/v1/x-1600.webp'],
    ['http://media.armatureailabs.com/covers/v1/x-1600.webp'],
    ['https://media.armatureailabs.com/other/x-1600.webp'],
    [`${base}-1600.png`],
    [`${base}-800.webp`],
  ])('renders nothing for %s', (url) => {
    const { container } = render(<CoverImage url={url as string | null | undefined} className="c" sizes="1px" />);
    expect(container.querySelector('img')).toBeNull();
  });
});
