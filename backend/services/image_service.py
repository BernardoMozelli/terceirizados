from PIL import Image
import os

THUMBNAIL_SIZE = (128, 128)

def create_thumbnail(image_path, thumb_path):
    """
    Creates a thumbnail for the given image.
    """
    try:
        img = Image.open(image_path)
        img.thumbnail(THUMBNAIL_SIZE)
        img.save(thumb_path, "PNG")
        return True
    except Exception as e:
        print(f"Error creating thumbnail: {e}")
        return False
