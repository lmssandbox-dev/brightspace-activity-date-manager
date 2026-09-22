'use strict';

const { id } = require('./id');

function createSourceCoursesClient({ read, sourcePath }) {
  return {
    getCurrentReofferedCourse: (sourceOrgUnitId, subOrgId) =>
      read(sourcePath(`${id(sourceOrgUnitId)}/currentReofferedCourse`, subOrgId)),
    getAllReofferedCourses: (sourceOrgUnitId, subOrgId) =>
      read(sourcePath(`${id(sourceOrgUnitId)}/reofferedCourses`, subOrgId)),
    getSourceCourse: (courseOfferingId, subOrgId) =>
      read(sourcePath(`courseOfferings/${id(courseOfferingId)}`, subOrgId))
  };
}

module.exports = { createSourceCoursesClient };
