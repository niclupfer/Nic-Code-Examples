/* Remember that mongoose needs to bind 'this', therefore stick to function(...) notation */
const shortId = require('shortid');
const sharp = require('sharp');
const config = require('config')
const path = require('path')
const getColors = require('get-image-colors')

const CHILD_SIZES = JSON.parse(config.images.childSizes);
const SIBLING_START_SIZE = config.images.siblingStartSize || 30000
const IMAGE_DIR = config.images.imageDir;
const middleware = {};
const logger = require('../../../services/logging/logger')


const createChildren = async(parentDoc) => {
  const parentImg = sharp(parentDoc.path);
  const parentBaseFilename = parentDoc.filename.split('.')[0]

  const { width, height, format } = await parentImg.metadata()
  const maxSide = width > height ? width : height
  const scalingSide = width > height ? "width" : "height"
  
  //dont make siblings for small images
  // disabling this with new discrete images sizes
    // if ( width*height < SIBLING_START_SIZE ) { return [] }
 
  //no sense in rescaling and svg
  if ( format === 'svg' ) { return []; }
  //no pyramiding with gifs
  if ( format === 'gif' ) { return []; }

  const createChild = async(size) => {

    const childFilename = `${parentBaseFilename}_${size}.${format}`
    const childPath = `${path.parse(parentDoc.path).dir}/${childFilename}`

    let newWidth = width;
    let newHeight = height;

    if(scalingSide == "width"){
      newWidth = size;
      let scaleBy =  newWidth / width;
      newHeight = Math.round(height * scaleBy);
    } else {
      newHeight = size;
      let scaleBy = newHeight / height;
      newWidth = Math.round(width * scaleBy);
    }

    if(newWidth < 1) newWidth = 1;
    if(newHeight < 1) newHeight = 1;

    await parentImg.resize( Math.floor(newWidth), Math.floor(newHeight) ).toFile(childPath)

    return { filename : childFilename, path : childPath, width: newWidth, height: newHeight}
  }
  
  let childSizesToCreate = [];
  for(let size of CHILD_SIZES) {
    if(size < maxSide)
      childSizesToCreate.push(size)
  }

  const children = await Promise.all( childSizesToCreate.map(createChild) );
  return children;
}

middleware.preSave = async function(next) {
  try {
    //the length param is required incase in svg or very small image
    if ( this.createChildren === true && this.children.length == 0 ) {
      this.children = await createChildren(this);
      //We cannot get colors until we know children were created (some formats / sizes return empties)
      if ( this.children.length > 0 ) {
        await getColors(this.children[0].path).then(colors => {
          this.colors = colors;
        });
      }

      logger.verbose(`Image children succcess ${this._id}`)
    }

    //since save should only ever be called once
    this.appPath = path.join( config.images.appPath, this.path.split( path.parse(config.images.uploadsDir).base ).pop() )

  } catch (e) {
    logger.error('image presave %O', e)
  }
  next()
}

middleware.preFind = async function(next) {
  this.populate('children')
  next()
}


middleware.preFindOne = async function(next) {
  this.populate('children')
  next()
}






module.exports = middleware
