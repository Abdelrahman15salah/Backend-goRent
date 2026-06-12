import UserModel from "../../DB/Models/user.model.js";
import {logAdminAction} from "./adminlog.controller.js";


const toggleBanStatus =async (req,res,next ) => {
const {id} = req.params
    const isbanned = req.path.includes('ban') && !req.path.includes('unban')

try {
    const user = await UserModel.findByIdAndUpdate(
        id,
        {isbanned},
        {new: true}
    )
    if (!user){
        return res.status(404 ).json({message: 'user not found '})
        }

    await logAdminAction({
        adminId: req.user.id,
        action :isbanned ? 'BAN_USER' : 'UNBAN_USER',
        targetId:id,
        targetType:'USER',
        notes: `admin performed ${isbanned ? 'ban' : 'unban'} on user ${id}`



    })
    res.status(200).json({
            message:`User ${id} ${isbanned ? 'banned' : 'unbanned'} successfully`,
            user:user
    })

}
catch (error) {
    if(!res.headersSent){
        res.status(500).json({message: error.message})

    }
}
}
export {toggleBanStatus}