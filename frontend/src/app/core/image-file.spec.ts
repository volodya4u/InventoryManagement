import { imageFileError } from './image-file';

const TWO_MB = 2 * 1024 * 1024;

function file(name: string, type: string, size = 1024): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe('imageFileError', () => {
  // @trace FR-75
  it('accepts no file, and JPG, JPEG and PNG files whatever the case of the extension', () => {
    expect(imageFileError(null)).toBe('');
    expect(imageFileError(file('rose.jpg', 'image/jpeg'))).toBe('');
    expect(imageFileError(file('rose.jpeg', 'image/jpeg'))).toBe('');
    expect(imageFileError(file('rose.png', 'image/png'))).toBe('');
    expect(imageFileError(file('ROSE.PNG', 'image/png'))).toBe('');
  });

  // @trace FR-75
  it('rejects a file by extension alone and by MIME type alone', () => {
    const message = 'Select a JPG, JPEG, or PNG file.';
    expect(imageFileError(file('rose.gif', 'image/png'))).toBe(message);
    expect(imageFileError(file('rose.png', 'image/gif'))).toBe(message);
    expect(imageFileError(file('rose.png', ''))).toBe(message);
    expect(imageFileError(file('rose', 'image/png'))).toBe(message);
  });

  // @trace FR-75
  it('allows exactly 2 MB and rejects anything larger', () => {
    expect(imageFileError(file('rose.png', 'image/png', TWO_MB))).toBe('');
    expect(imageFileError(file('rose.png', 'image/png', TWO_MB + 1))).toBe(
      'The image size cannot exceed 2 MB.',
    );
  });

  // @trace FR-75
  it('reports the wrong type before the size', () => {
    expect(imageFileError(file('rose.gif', 'image/gif', TWO_MB + 1))).toBe(
      'Select a JPG, JPEG, or PNG file.',
    );
  });
});
