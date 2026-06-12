import AdminLog from "../../DB/Models/adminLog.model.js";


export const logAdminAction = async ({adminId , action , targetId , targetType, notes}) =>{
    try {
        await AdminLog.create({adminId , action , targetId , targetType, notes})
    }
    catch (error) {
        console.log('failed to log admin action',error)
    }
}
