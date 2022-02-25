
import {
    getSolidDataset,
    getThing,
    setThing,
    getStringNoLocale,
    setStringNoLocale,
    getFile,
    isRawData,
    getContentType,
    getSourceUrl,
    getSourceIri,
    getPublicAccess,
    getAgentAccess,
    setAgentDefaultAccess,
    saveSolidDatasetAt,
    createSolidDataset,
    buildThing,
    createThing,
    getSolidDatasetWithAcl,
    hasResourceAcl,
    hasFallbackAcl,
    hasAccessibleAcl,
    createAcl,
    createAclFromFallbackAcl,
    getResourceAcl,
    setAgentResourceAccess,
    saveAclFor,
    access,
    deleteFile,
    deleteSolidDataset,
    overwriteFile,
    removeThing,
    getProfileAll,
    getThingAll,
    getDatetime,
    getStringNoLocaleAll,
    isContainer,
    getContainedResourceUrlAll,
    UrlString,
    getUrl,
    setUrl
} from "/@inrupt/solid-client";

import { Session, getDefaultSession, fetch } from "/@inrupt/solid-client-authn-browser";
import { SCHEMA_INRUPT, VCARD, FOAF, RDF } from "/@inrupt/vocab-common-rdf";
import { departments } from "./healthcareDepartments";
import { checkIfDatasetExists, checkIfAdministrator, getDepartments, getFilesInDataset, getAccessToDataset, checkIfPersonHasAccess } from "./podReader";
import { writeAppointment, createDepartmentDataset, storeMedicalInsitutionInformation, uploadMedicalRecord, grantAccessToDataset, createInsuranceDiagnosesDataset, addThingToDataset } from "./podWriter";
import * as _ from 'lodash'
//import fetch from 'unfetch';

// If your Pod is *not* on `solidcommunity.net`, change this to your identity provider.
const SOLID_IDENTITY_PROVIDER = "https://solidcommunity.net";
document.getElementById(
    "solid_identity_provider"
).innerHTML = `[<a target="_blank" href="${SOLID_IDENTITY_PROVIDER}">${SOLID_IDENTITY_PROVIDER}</a>]`;

const NOT_ENTERED_WEBID =
    "...not logged in yet - but enter any WebID to read from its profile...";

var session = new Session();

const buttonLogin = document.getElementById("btnLogin");
const writeForm = document.getElementById("writeForm");
const readForm = document.getElementById("readForm");
var accessedPodOwnerUrl = ""
var accessedPodOwnerBaseUrl = ""
var accessedHealthDataContainerUrl = ""
var accessedHealthDataType = ""
var accessedHealthDataContainerAdministrator = ""
var medicalInstitutionRegistered = Boolean(0);
var initialStateOfDatasetAccess = {}
var currentlyAccessedDatasetUrl = ""
var typesOfHealthData = ['public', 'private', 'GP']
var typesOfHealthDataForDisplay = ['Public', 'Private', 'General Practitioner (GP)']
var typesOfHealthDataExists = [false, false, false]
// 1a. Start Login Process. Call session.login() function.
async function login() {
    if (!session.info.isLoggedIn) {
        await session.login({
            oidcIssuer: SOLID_IDENTITY_PROVIDER,
            clientName: "Inrupt tutorial client app",
            redirectUrl: window.location.href
        });
    }
}

async function logout() {
    document.getElementById("webID").value = "";
    document.getElementById("loginButtonDiv").style.display = "block"
    document.getElementById("btnLogout").style.display = "none"
    document.getElementById("labelStatus").innerHTML = ""
    resetCurrentPodSession(true)
    await session.logout();
    document.getElementById("accessingPod").style.display = "none"
    localStorage.clear()
    let authCookie = document.cookie;
    // browser.cookies.remove(*)
    // document.cookie = "authCookie=; expires = Thu, 01 Jan 1970 00:00:00 UTC; path=/;"
    const cookies = document.cookie.split(";")
}

// 1b. Login Redirect. Call session.handleIncomingRedirect() function.
// When redirected after login, finish the process by retrieving session information.
async function handleRedirectAfterLogin() {
    await session.handleIncomingRedirect(window.location.href);
    if (session.info.isLoggedIn) {
        // Update the page with the status.
        document.getElementById(
            "labelStatus"
        ).innerHTML = `Your session is logged in with the WebID [<a target="_blank" href="${session.info.webId}">${session.info.webId}</a>].`;
        document.getElementById("labelStatus").setAttribute("role", "alert");
        document.getElementById("webID").value = session.info.webId;
        document.getElementById("btnLogout").style.display = "block"
        document.getElementById("loginButtonDiv").style.display = "none"
        document.getElementById("accessingPod").style.display = "block"
    }
}


handleRedirectAfterLogin();


async function checkMedicalInstitutionStatus(podOwner) {
    if (podOwner) {
        var webID;
        if (podOwner.includes("signedInUser")) webID = session.info.webId
        else if (podOwner == "specifiedUser") webID = document.getElementById("podOwner").value.trim(); //Take value from input box and remove whitespace
        accessedPodOwnerUrl = webID;
        document.getElementById("podOwnerUrl").innerHTML = accessedPodOwnerUrl
        document.getElementById("podOwnerUrl").href = accessedPodOwnerUrl
        accessedPodOwnerBaseUrl = webID.substring(0, (webID.length - 16))

        let accessTypeOfHealthDataForm = document.getElementById("accessHealthDataForm")
        for (var i = 0; i < typesOfHealthData.length; i++) {    //Loop through array containing 'public', 'private', 'GP'
            var healthDataDatasetUrl = accessedPodOwnerBaseUrl + "/" + typesOfHealthData[i] + "HealthData3/Info"
            let healthDataExists = await checkIfDatasetExists(session, healthDataDatasetUrl)    //Checks that they have read access to 'info' dataset, meaning they can do something to that type of health data
            if (healthDataExists == true) { //If the user has been granted some aspect of access to the current health data type
                let selectableHealthDataType = document.getElementById(typesOfHealthData[i] + "Button")
                selectableHealthDataType.disabled = false       //Allow the button for that health data to be clicked
                selectableHealthDataType.onclick = async function () {
                    selectTypeOfHealthData(selectableHealthDataType.id.substring(0, selectableHealthDataType.id.indexOf("Button"))) //Open that health data container when clicked
                }
                typesOfHealthDataExists[i] = true
            }
        }
        document.getElementById("accessPodForm").style.display = "none"     //Hide the div that allows you to select what pod you wish to access
        accessTypeOfHealthDataForm.style.display = "block"          //Display div showing 3 health data container options
        if (!typesOfHealthDataExists.includes(true)) {  //Means no health data exists
            if (podOwner == "signedInUser") {
                alert("You have not created a dataset in your Solid pod to hold medical record information. Please create one by following the steps below.")
                medicalInstitutionRegistered = false;
                document.getElementById("accessingPod").style.display = "none"
                document.getElementById("registerNewMedicalInstitution").style.display = 'block'        //Display pod allowing them to create a health data container
            }
            else {
                resetCurrentPodSession(true)
                alert("You have not been authorized to view medical records in the specified individual's pod, or they have no Health Data stored with the application.")
            }
            document.getElementById("podOwner").value = "";
        }
        else {
            if (podOwner == "signedInUserNew" && !document.getElementById("newInstitutionWarningMessage")) {        //Comes in here when pod owner clicks 'Register new medical institution'
                let existingHealthDataTypes = []
                for (var i = 0; i < typesOfHealthData.length; i++) {
                    if (typesOfHealthDataExists[i] == true) existingHealthDataTypes.push(typesOfHealthData[i])
                }
                let warningMessage = document.createElement("p")
                warningMessage.style.color = "red"
                warningMessage.id = "newInstitutionWarningMessage"
                warningMessage.innerHTML = "You currently have health data containers saved for the following types: [" + existingHealthDataTypes + "], if you register a new institution of one of these types it will completely wipe all the data that is currently held in those containers."
                document.getElementById("institutionTypeLabel").appendChild(warningMessage)
            }
        }

    }
}

async function selectTypeOfHealthData(healthDataType) {
    accessedHealthDataType = healthDataType //Either 'public', 'private', or 'GP'
    accessedHealthDataContainerUrl = accessedPodOwnerBaseUrl + "/" + healthDataType + "HealthData3/"
    var accessedHealthDataInfoDatasetUrl = accessedHealthDataContainerUrl + "Info"
    let signedInUsersAccessToOverall = ""
    document.getElementById("accessingPod").style.display = "none"
    const healthDataInfoDataset = await getSolidDataset(accessedHealthDataInfoDatasetUrl, { fetch: session.fetch });        //Get 'Info' dataset and extract variables
    const institutionDetails = await getThing(healthDataInfoDataset, accessedHealthDataInfoDatasetUrl + "#medicalInstitutionDetails")
    let literalName = await getStringNoLocale(institutionDetails, "http://schema.org/name")
    let literalAddress = await getStringNoLocale(institutionDetails, "http://schema.org/address")
    let administrator = await getUrl(institutionDetails, "https://schema.org/member")
    accessedHealthDataContainerAdministrator = administrator
    if (accessedPodOwnerUrl == session.info.webId) {   //Check that the signed in user is pod owner. Enable creating new health data, registering for insurance and editing of administrator if they are
        document.getElementById("initiateInsuranceRequestButton").disabled = false
        document.getElementById("registerNewMedicalInstitutionButton").disabled = false
        document.getElementById("setAdministratorToEditable").style.display = "block"
    }
    if ([accessedPodOwnerUrl, accessedHealthDataContainerAdministrator].includes(session.info.webId)) {   //Check that the signed in user is either the pod owner or institution administrator
        document.getElementById("editInstitutionInfoLabel").style.display = "block" //Enable editing of institution metatdata
        document.getElementById("setNameToEditable").style.display = "block"       //Enable editing of institution metatdata
        document.getElementById("setAddressToEditable").style.display = "block"    //Enable editing of institution metatdata
        document.getElementById("registerNewAppointmentButton").disabled = false    //Enable creation of new appointments
        document.getElementById("registerNewAppointmentButton").title = ""          //Remove tooltip saying that this action cannot be performed
    }

    document.getElementById("typeOfAccessedHealthData").innerHTML = "<u>Accessing Health Data of type</u>: " + healthDataType       //Display pod info along top of screen
    document.getElementById("ownerOfPod").innerHTML = "<u>Currently accessing the pod belonging to</u>: " + accessedPodOwnerUrl;
    document.getElementById("nameOfInstitution").innerHTML = "<u>Who receives care at</u>: " + literalName;
    document.getElementById("addressOfInstitution").innerHTML = "<u>Which is located at</u>: " + literalAddress;
    document.getElementById("administratorOfInstitution").innerHTML = "<u>And the institution administrator is</u>: " + administrator;
    document.getElementById("accessingPod").style.display = "none"                  //Hide pod showing 3 health data container options
    document.getElementById("institutionInformation").style.display = 'block'       //Display pod showing selected health data container metadata and application action buttons ('Create Appointment','View Records' etc.)
}

function resetCurrentPodSession(completelyReset) {
    if (completelyReset == true) {      //Takes the application back to the screen asking what pod you would like to access
        document.getElementById("institutionInformation").style.display = "none";
        document.getElementById("accessHealthDataForm").style.display = "none";
        document.getElementById("accessingPod").style.display = "block";
        document.getElementById("accessPodForm").style.display = "block";
    }
    document.getElementById("uploadNewAppointmentDetails").style.display = "none"       //Set all divs to hidden that could possibly be displayed
    document.getElementById("accessingRecordsDiv").style.display = "none";
    document.getElementById("uploadNewMedicalRecordDiv").style.display = "none";
    document.getElementById("registerNewMedicalInstitution").style.display = "none";
    document.getElementById("createNewDiagnosisDiv").style.display = "none";
    document.getElementById("createNewPrescriptionDiv").style.display = "none";
    document.getElementById("createNewGeneralRecordDiv").style.display = "none";
    document.getElementById("insuranceDiv").style.display = "none";
    document.getElementById("podDiagramDiv").style.display = "none";

    if (document.getElementById("containerForDisplayedRecords")) document.getElementById("containerForDisplayedRecords").remove()  //Remove div showing displayed records if it exists i.e. the user is currently viewing records
    if (document.getElementById("containerForRecordAccess")) document.getElementById("containerForRecordAccess").remove()          //Remove div showing displayed access if it exists
    if (document.getElementById("selectedDepartment")) document.getElementById("selectedDepartment").remove()   //Remove selected dropdown input box if it exists

    let buttonForAppointment = document.getElementById("registerNewAppointmentButton")      //Reset status of all main application buttons 
    buttonForAppointment.classList.remove("clicked-button")
    buttonForAppointment.style.display = "block"
    let buttonForReadingFiles = document.getElementById("accessMedicalRecordsButton")
    buttonForReadingFiles.classList.remove("clicked-button")
    buttonForReadingFiles.style.display = "block"
    let buttonForUploadingFiles = document.getElementById("uploadMedicalRecordsButton")
    buttonForUploadingFiles.classList.remove("clicked-button")
    buttonForUploadingFiles.style.display = "block"
    let buttonForInitiatingInsurance = document.getElementById("initiateInsuranceRequestButton")
    buttonForInitiatingInsurance.classList.remove("clicked-button")
    buttonForInitiatingInsurance.style.display = "block"
    let buttonForViewingPodDiagram = document.getElementById("viewPodDiagramButton")
    buttonForViewingPodDiagram.classList.remove("clicked-button")
    buttonForViewingPodDiagram.style.display = "block"
    let buttonForRegisteringNewInsitution = document.getElementById("registerNewMedicalInstitutionButton")
    buttonForRegisteringNewInsitution.classList.remove("clicked-button")
    buttonForRegisteringNewInsitution.style.display = "block"

    let departmentSelectionForm = document.getElementById("departmentSelectionForm")        
    while (departmentSelectionForm.children.length > 1) {                           //Remove all department options from the department dropdown
        let nextNode = departmentSelectionForm.lastChild
        departmentSelectionForm.removeChild(nextNode);
    }

    for (var i = 0; i < typesOfHealthData.length; i++) {
        let typeID = typesOfHealthData[i] + "HealthDataType"
        let containerInDiagram = document.getElementById(typeID)
        containerInDiagram.innerHTML = typesOfHealthDataForDisplay[i]   //Reset the inner content of the pod diagram
    }
    document.getElementById("medicalRecordTypeSelection").style.display = "block"   //Reset choice of medical record type to being displayed incase user was in the middle 
}

async function registerNewMedicalInstitution() {        //Extract values from form and send details to podWriter for upload
    const institutionType = document.getElementById("institutionType").value
    const institutionName = document.getElementById("institutionName").value;
    const institutionAddress = document.getElementById("institutionAddress").value;
    let administratorWebID = document.getElementById("institutionSysAdmin").value;
    if (administratorWebID == "") administratorWebID = null
    var healthDataDatasetUrl = accessedPodOwnerBaseUrl + "/" + institutionType + "HealthData3"  // https://testuser1.solidcommunity.net/profile/card#me
    let institutionDetails = {
        name: institutionName,
        address: institutionAddress,
        administrator: administratorWebID
    }
    await storeMedicalInsitutionInformation(session, healthDataDatasetUrl, institutionDetails)
    await checkMedicalInstitutionStatus("signedInUser");
    await selectTypeOfHealthData(institutionType)       //Access new health data container after it has been created
    resetCurrentPodSession(false)
}

async function updateMedicalInstitutionField(fieldID, newValue) {       //Update field in the medical institution metadata thing
    let accessedHealthDataInfoDatasetUrl = accessedHealthDataContainerUrl + "Info"
    var infoDataSet = await getSolidDataset(accessedHealthDataInfoDatasetUrl, { fetch: session.fetch });
    let institutionDetails = await getThing(infoDataSet, accessedHealthDataInfoDatasetUrl + "#medicalInstitutionDetails")
    if (fieldID == "http://schema.org/name" || fieldID == "http://schema.org/address") institutionDetails = await setStringNoLocale(institutionDetails, fieldID, newValue)
    else if (fieldID == "https://schema.org/member") institutionDetails = await setUrl(institutionDetails, fieldID, newValue)
    infoDataSet = await setThing(infoDataSet, institutionDetails)
    await saveSolidDatasetAt(accessedHealthDataInfoDatasetUrl, infoDataSet, { fetch: session.fetch })
}

async function saveNewAppointment() {       //Extract fields of new appointment and send object to podWriter
    let department = document.getElementById("selectedAppointmentDepartmentDropdown").value 
    let timeOfAppointment = document.getElementById("newAppointmentTime").value;
    let dateOfAppointment = document.getElementById("newAppointmentDate").value;
    let doctorWebID = document.getElementById("newAppointmentDoctor").value;
    let notes = document.getElementById("newAppointmentNotes").value;

    let appointmentDateAsString = "20" + dateOfAppointment.substring(6, 8) + "-" + dateOfAppointment.substring(3, 5) + "-" + dateOfAppointment.substring(0, 2) + " " + timeOfAppointment
    let appointmentFullTime = new Date(appointmentDateAsString)
    let appointmentDetails = {
        podOwnerUrl: accessedPodOwnerUrl,
        appointmentDepartment: department,
        appointmentTime: appointmentFullTime,
        appointmentDoctor: doctorWebID,
        appointmentNotes: notes,
        institutionAdministrator: accessedHealthDataContainerAdministrator
    }
    await writeAppointment(session, accessedHealthDataContainerUrl, appointmentDetails)
    document.getElementById("saveNewAppointmentDetailsForm").reset();
    alert("Appointment details saved successfully to pod")
}

async function getPatientDepartmentsAndDisplay(useOfDropdown, locationForDropdown) {        //Add a department dropdown selection to the designated application area

    let departments = await getDepartments(session, accessedHealthDataContainerUrl)
    if (departments.length == 0) {
        alert("The currently accessed pod owner has no medical records stored in their pod. Register details of an appointment to allow for the creation of records in the appointment department.")
        resetCurrentPodSession(false)
        return
    }
    else {
        let departmentListForm = ""


        if (useOfDropdown == "uploadingNewRecord") {
            departmentListForm = document.getElementById(locationForDropdown)
        }
        else if (useOfDropdown == "accessingRecords") {
            document.getElementById("accessingRecordsDiv").style.display = "block"
            departmentListForm = document.getElementById("departmentSelectionForm")
            if (departmentListForm.childNodes.length < 4) {     //Means that no dropdowns have been added to the form - add them in
                let selectAbleRecordType = document.createElement("select")
                selectAbleRecordType.id = "selectedRecordType"
                selectAbleRecordType.style.margin = "2%"

                let appointmentOption = document.createElement("option")
                appointmentOption.innerHTML = "Appointments"
                selectAbleRecordType.appendChild(appointmentOption)
                let diagnosesOption = document.createElement("option")
                diagnosesOption.innerHTML = "Diagnoses"
                selectAbleRecordType.appendChild(diagnosesOption)
                let prescriptionOption = document.createElement("option")
                prescriptionOption.innerHTML = "Prescriptions"
                selectAbleRecordType.appendChild(prescriptionOption)
                let recordsOption = document.createElement("option")
                recordsOption.innerHTML = "Records"
                selectAbleRecordType.appendChild(recordsOption)
                departmentListForm.appendChild(selectAbleRecordType)
            }
        }

        if (departmentListForm.childNodes.length < 5) {     //Adds selectable department options to dropdown after they have been rendered
            let selectAbleDepartment = document.createElement("select")
            selectAbleDepartment.id = "selectedDepartment"
            selectAbleDepartment.style.margin = "2%"
            for (var i = 0; i <= departments.length - 1; i++) {
                let newOption = document.createElement("option")
                newOption.innerHTML = departments[i].substring(departments[i].lastIndexOf("HealthData3/") + 12, departments[i].length - 1)
                selectAbleDepartment.appendChild(newOption)
            }
            departmentListForm.appendChild(selectAbleDepartment)
        }
        if (useOfDropdown == "accessingRecords") {      //If the dropdown is for the 'Access medical records' section
            if (departmentListForm.childNodes.length < 6) {
                let submitButtonToView = document.createElement("button")
                submitButtonToView.type = "submit"
                submitButtonToView.id = "viewRecordsButton"
                submitButtonToView.innerHTML = "View records in selected dataset"
                submitButtonToView.style.margin = "2%"
                submitButtonToView.classList.add("light-blue-button")
                submitButtonToView.style.width = "200px"
                departmentListForm.appendChild(submitButtonToView)

                let submitButtonToManageAccess = document.getElementById("viewAccessButton") //Add button for managing access if it doesn't exist
                if (!submitButtonToManageAccess) {
                    submitButtonToManageAccess = document.createElement("button")
                    submitButtonToManageAccess.innerHTML = "Manage access to selected dataset"
                    submitButtonToManageAccess.classList.add("light-blue-button")
                    submitButtonToManageAccess.style.width = "200px"
                    submitButtonToManageAccess.onclick = async function () {
                        let selectedDepartment = document.getElementById("selectedDepartment").value
                        let selectedRecordType = document.getElementById("selectedRecordType").value
                        await getAccessAndDisplay(selectedRecordType, selectedDepartment)
                    }
                }
                departmentListForm.append(submitButtonToManageAccess)

                let submitButtonToViewInsuranceDiagnoses = document.getElementById("buttonForViewingInsuranceDataset")  //Add button for viewing insurance diagnoses if it doesn't exist
                if (!submitButtonToViewInsuranceDiagnoses) {
                    submitButtonToViewInsuranceDiagnoses = document.createElement("input")
                    submitButtonToViewInsuranceDiagnoses.type = "button"
                    submitButtonToViewInsuranceDiagnoses.value = "View diagnoses for insurance"
                    submitButtonToViewInsuranceDiagnoses.classList.add("light-blue-button")
                    submitButtonToViewInsuranceDiagnoses.style.width = "200px"

                    submitButtonToViewInsuranceDiagnoses.id = "buttonForViewingInsuranceDataset"
                    submitButtonToViewInsuranceDiagnoses.style.marginLeft = "20%"

                    submitButtonToViewInsuranceDiagnoses.onclick = async function () {
                        await getPatientFilesAndDisplay("", "", true)   //Special case of calling getPatientFilesAndDisplay that only retrieves files in the insurance dataset
                    }
                }
                departmentListForm.appendChild(submitButtonToViewInsuranceDiagnoses)
            }

        }

    }
}

async function getAccessAndDisplay(recordType, department) {
    let urlOfSelectedDataset = accessedHealthDataContainerUrl + department + "/" + recordType
    let access = ""
    try {
        access = await getAccessToDataset(session, urlOfSelectedDataset)    //Get all people that have been granted access to the selected dataset
    }
    catch (err) {
        if (err == 403) alert('You have not been granted permission to view who can access this dataset. Contact the pod owner to request access')
        else if (err == 404) alert('No access has been established for the current dataset.')
    }
    initialStateOfDatasetAccess = { ...access }                 //Save initial state of the access to the selected dataset for comparison after updates
    currentlyAccessedDatasetUrl = urlOfSelectedDataset      
    if (Object.entries(access).length > 0) {        //If there is at least one person with access to the dataset
        let existingDisplayedFiles = document.getElementById("containerForDisplayedRecords")   //Remove currently displayed records if they are displayed
        if (existingDisplayedFiles) existingDisplayedFiles.remove();
        let existingDisplayedAccess = document.getElementById("containerForRecordAccess") //Remove currently displayed access if it is displayed
        if (existingDisplayedAccess) existingDisplayedAccess.remove();

        let containerDivForAccess = document.createElement("div")       //Create div to display access
        containerDivForAccess.id = "containerForRecordAccess"
        containerDivForAccess.className = "panel"

        let headerOfContainer = document.createElement("h3")        //Header for the div
        headerOfContainer.innerHTML = "Currently permitted individuals of the selected dataset"
        headerOfContainer.className = "section-header"
        containerDivForAccess.appendChild(headerOfContainer)

        //******************Add description of what each access level means*****************************

        let index = 0
        let readAccessCheckbox = document.createElement("input")        //Labels and checkboxes for each individuals access
        let readAccessLabel = document.createElement("label")
        let writeAccessCheckbox = document.createElement("input")
        let writeAccessLabel = document.createElement("label")
        let appendAccessCheckbox = document.createElement("input")
        let appendAccessLabel = document.createElement("label")
        let controlAccessCheckbox = document.createElement("input")
        let controlAccessLabel = document.createElement("label")

        for (const [person, personsAccess] of Object.entries(access)) {
            let accessDisplayObj = document.createElement("div")        //Create div for each individual with access
            accessDisplayObj.id = "displayedAccess" + index     //Assign ID of each div object corresponding to the index of the individual in the overall result
            accessDisplayObj.className = "panel"
            if (index % 2 == 1) accessDisplayObj.classList.add("alt-color")     //Make the div of every second person with access a different colour
            let individualsName = document.createElement("h3")
            individualsName.innerHTML = "Individual's name: <u>" + person + "</u>"
            individualsName.style.textAlign = "center"

            readAccessCheckbox = document.createElement("input")
            readAccessCheckbox.type = "checkbox"
            readAccessCheckbox.id = "readAccessFor" + index
            readAccessCheckbox.style.marginBottom = "5%"      
            if (personsAccess.read) readAccessCheckbox.checked = true

            readAccessLabel = document.createElement("label")
            readAccessLabel.innerHTML = "Read"
            readAccessLabel.id = "readAccessLabelFor" + index
            readAccessLabel.style.marginRight = "2%"

            writeAccessCheckbox = document.createElement("input")
            writeAccessCheckbox.type = "checkbox"
            writeAccessCheckbox.id = "writeAccessFor" + index
            if (personsAccess.write) writeAccessCheckbox.checked = true

            writeAccessLabel = document.createElement("label")
            writeAccessLabel.innerHTML = "Write"
            writeAccessLabel.style.marginRight = "2%"

            appendAccessCheckbox = document.createElement("input")
            appendAccessCheckbox.type = "checkbox"
            appendAccessCheckbox.id = "appendAccessFor" + index
            if (personsAccess.append) appendAccessCheckbox.checked = true

            appendAccessLabel = document.createElement("label")
            appendAccessLabel.innerHTML = "Append"
            appendAccessLabel.style.marginRight = "2%"

            controlAccessCheckbox = document.createElement("input")
            controlAccessCheckbox.type = "checkbox"
            controlAccessCheckbox.id = "controlAccessFor" + index
            if (personsAccess.controlRead && personsAccess.controlWrite) controlAccessCheckbox.checked = true       //Control read and control write must be in sync - only allow one checkbox to be ticked

            controlAccessLabel = document.createElement("label")
            controlAccessLabel.innerHTML = "Control"
            controlAccessLabel.style.marginRight = "2%"

            let updateAccessButton = document.createElement("button")       //Create a button to save the changes to an individual's access and set it to hidden
            updateAccessButton.style.float = "right"
            updateAccessButton.style.display = "none"
            updateAccessButton.style.marginTop = "5%"
            updateAccessButton.style.width = "200px"
            updateAccessButton.id = "updateAccessFor" + index
            updateAccessButton.classList.add("light-blue-button")
            updateAccessButton.innerHTML = "Make changes to access"

            accessDisplayObj.append(individualsName, readAccessCheckbox, readAccessLabel, writeAccessCheckbox, writeAccessLabel, appendAccessCheckbox, appendAccessLabel, controlAccessCheckbox, controlAccessLabel, updateAccessButton)

            containerDivForAccess.appendChild(accessDisplayObj)
            index++
        }
        let medicalRecordsDiv = document.getElementById("accessingRecordsDiv")
        medicalRecordsDiv.appendChild(containerDivForAccess)        //Add div containing each indiviual's access - now they have IDs that can be called for adding click event handlers

        let renderedObj = document.getElementById("containerForRecordAccess") //Find the access div which is now in the dom

        for (var i = 0; i < renderedObj.childNodes.length; i++)    //Loop through each individual div within the overall div -> each iteration is a new individual with access
        {
            for (var j = 0; j < renderedObj.childNodes[i].childNodes.length; j++) {     //Loop through the child nodes in each individual div - the labels and the checkboxes for each access level
                if (renderedObj.childNodes[i].childNodes[j].nodeName == "LABEL") renderedObj.childNodes[i].childNodes[j].htmlFor = renderedObj.childNodes[i].childNodes[j - 1].id //Update the 'htmlFor' attribute of each label as the ID of the corresponding checkbox - which is the previous sibling
                else if (renderedObj.childNodes[i].childNodes[j].nodeName == "INPUT") {     //If the current node is a checkbox - find the corresponding button for this individual and set it to visible when the checkbox has been changed
                    let buttonId = "updateAccessFor" + (i - 1)  //First child node is h3 tag, first person with access will be at pos. 1 with an id of updateAccessFor0
                    renderedObj.childNodes[i].childNodes[j].onchange = function () {

                        document.getElementById(buttonId).style.display = "block"
                    }
                }
                else if (renderedObj.childNodes[i].childNodes[j].nodeName == "BUTTON") {    //If the current node is a button to update access 
                    let button = renderedObj.childNodes[i].childNodes[j]
                    renderedObj.childNodes[i].childNodes[j].onclick = function () { updateDatasetAccess(button.id) } //Set the onclick event handler to update the access of the current index based on its current value
                }
            }
        }

        let buttonToAddNew = document.createElement("button")       //Create a button for adding access to a new individual
        buttonToAddNew.innerHTML = "+"
        buttonToAddNew.className = "addNewButton"
        buttonToAddNew.id = "addNewAccessButton"
        buttonToAddNew.onclick = function () {  //When the button is clicked display a new div for specifying the individual's WebID and access levels

            buttonToAddNew.style.display = "none"   //Hide the button when it's clicked
            let addingNewAccess = document.createElement("div") //Create a div for the new individual to be given access
            addingNewAccess.id = "grantingNewAccessDiv"
            addingNewAccess.classList.add("panel", "addingAccess")

            let webIDDiv = document.createElement("div")
            webIDDiv.className = "row"

            let newAgentWebIDLabel = document.createElement("h3")
            newAgentWebIDLabel.innerHTML = "New individual's WebID: "
            newAgentWebIDLabel.style.float = "left"

            let newAgentWebID = document.createElement("input")
            newAgentWebID.type = "url"
            newAgentWebID.placeholder = "Enter a new user's WebID"
            newAgentWebID.id = "webIDNewAccess"
            newAgentWebID.className = "column-3"
            newAgentWebID.style.marginTop = "2.5%"
            newAgentWebID.style.float = "left"
            newAgentWebID.style.width = "50%"

            webIDDiv.append(newAgentWebIDLabel, newAgentWebID)

            let clonedReadCheckbox = readAccessCheckbox.cloneNode(false)    //Clone the existing checkboxes and give it a new ID
            clonedReadCheckbox.id = "readAccessForNew"
            clonedReadCheckbox.checked = false
            let clonedReadLabel = readAccessLabel.cloneNode(true)   //Clone the existing labels with descendants (necessary for resetting the 'htmlFor' attribute)
            clonedReadLabel.htmlFor = clonedReadCheckbox.id
            clonedReadLabel.id = "readAccessLabelForNew"

            let clonedWriteCheckbox = writeAccessCheckbox.cloneNode(false)
            clonedWriteCheckbox.id = "writeAccessForNew"
            clonedWriteCheckbox.checked = false
            let clonedWriteLabel = writeAccessLabel.cloneNode(true)
            clonedWriteLabel.htmlFor = clonedWriteCheckbox.id
            clonedWriteLabel.id = "writeAccessLabelForNew"


            let clonedAppendCheckbox = appendAccessCheckbox.cloneNode(false)
            clonedAppendCheckbox.id = "appendAccessForNew"
            clonedAppendCheckbox.checked = false
            let clonedAppendLabel = appendAccessLabel.cloneNode(true)
            clonedAppendLabel.htmlFor = clonedAppendCheckbox.id
            clonedAppendLabel.id = "appendAccessLabelForNew"


            let clonedControlCheckbox = controlAccessCheckbox.cloneNode(false)
            clonedControlCheckbox.id = "controlAccessForNew"
            clonedControlCheckbox.checked = false
            let clonedControlLabel = controlAccessLabel.cloneNode(true)
            clonedControlLabel.htmlFor = clonedControlCheckbox.id
            clonedControlLabel.id = "controlAccessLabelForNew"

            let submitButton = document.createElement("button") //Button to save changes for the new individual's access
            submitButton.innerHTML = "Submit changes"
            submitButton.id = "submitAccessButtonForNew"
            submitButton.style.float = "right"
            submitButton.style.marginTop = "5%"
            submitButton.style.marginRight = "2.5%"
            submitButton.classList.add("green-button")
            submitButton.onclick = function () { grantNewAccess() }

            let cancelButton = document.createElement("button")    //Cancel button to remove the div that has just been created above and display the add button again
            cancelButton.innerHTML = "Cancel"
            cancelButton.id = "cancelAccessButtonForNew"
            cancelButton.style.float = "right"
            cancelButton.style.marginTop = "5%"
            cancelButton.classList.add("red-button")
            cancelButton.onclick = function () {
                document.getElementById("grantingNewAccessDiv").remove()
                document.getElementById("addNewAccessButton").style.display = "block"
            }
            addingNewAccess.append(webIDDiv, clonedReadCheckbox, clonedReadLabel, clonedWriteCheckbox, clonedWriteLabel, clonedAppendCheckbox, clonedAppendLabel, clonedControlCheckbox, clonedControlLabel, cancelButton, submitButton)

            document.getElementById("containerForRecordAccess").appendChild(addingNewAccess)
            document.getElementById("grantingNewAccessDiv").scrollIntoView()
        }

        document.getElementById("containerForRecordAccess").appendChild(buttonToAddNew)
    }
}

async function getPatientFilesAndDisplay(recordType, department, isForInsurer) {
    let urlOfSelectedDataset = ""
    if (isForInsurer == false) {
        urlOfSelectedDataset = accessedHealthDataContainerUrl + department + "/" + recordType
    }
    else {
        urlOfSelectedDataset = accessedHealthDataContainerUrl + "InsuranceDiagnoses1"
    }
    let filesInSelectedDataset = ""
    try {
        filesInSelectedDataset = await getFilesInDataset(session, urlOfSelectedDataset)
    }
    catch (errorCode) {
        if (errorCode == 403) alert('You have not been authorized to view the chosen record type. Contact the pod owner to request access')
        else if (errorCode == 404) alert('The selected record type and department combination does not exist.')
    }
    currentlyAccessedDatasetUrl = urlOfSelectedDataset
    if (filesInSelectedDataset.length > 0) {
        let totalFileObjs = []
        for (var i = 0; i <= filesInSelectedDataset.length - 1; i++) {
            let fileObj = {}
            fileObj.title = (filesInSelectedDataset[i].url.substring(filesInSelectedDataset[i].url.lastIndexOf("#") + 1, filesInSelectedDataset[i].url.length)).replaceAll("%20", " ")
            fileObj.url = filesInSelectedDataset[i].url
            fileObj.details = {}
            let keyValue = ""   //TODO: Trim strings from full URLs to the last portion, e.g. 'organiser'
            for (const [key, value] of Object.entries(filesInSelectedDataset[i].predicates)) {
                for (const [innerKey, innerValue] of Object.entries(value)) {
                    if (innerValue[0] && innerValue[0].length > 0) {
                        fileObj.details[key] = innerValue[0]
                    }
                    else {
                        for (const [innerKey2, innerValue2] of Object.entries(innerValue)) {
                            if (innerValue2[0] && innerValue2[0].length > 0) {
                                fileObj.details[key] = innerValue2[0]
                            }
                        }
                    }

                }
            }
            totalFileObjs.push(fileObj)
        }
        let existingDisplayedAccess = document.getElementById("containerForRecordAccess")
        if (existingDisplayedAccess) existingDisplayedAccess.remove();
        let existingDisplayedFiles = document.getElementById("containerForDisplayedRecords")
        if (existingDisplayedFiles) existingDisplayedFiles.remove();
        let containerDivForFiles = document.createElement("div")
        containerDivForFiles.id = "containerForDisplayedRecords"
        containerDivForFiles.className = "panel"

        let headerOfContainer = document.createElement("h3")
        if (!isForInsurer) headerOfContainer.innerHTML = "Files in current dataset"
        else headerOfContainer.innerHTML = "Relevant diagnoses for life insurance"
        headerOfContainer.className = "section-header"
        containerDivForFiles.appendChild(headerOfContainer)


        for (var k = 0; k < totalFileObjs.length; k++) {
            let fileDisplayObj = document.createElement("div")
            fileDisplayObj.id = "displayedFile" + k
            fileDisplayObj.className = "panel"
            if (k % 2 == 1) {
                fileDisplayObj.classList.add("alt-color")
            }
            let titleOfFile = document.createElement("h3")
            titleOfFile.innerHTML = "Title: " + totalFileObjs[k].title
            titleOfFile.style.textAlign = "center"
            let urlOfFile = document.createElement("h6")
            urlOfFile.innerHTML = "URL: " + totalFileObjs[k].url
            let detailsOfFile = document.createElement("div")
            for (const [key, value] of Object.entries(totalFileObjs[k].details)) {
                let fileProperty = document.createElement("p")
                let indexOfLastDivider = key.lastIndexOf("#")
                if (indexOfLastDivider < key.lastIndexOf("/")) indexOfLastDivider = key.lastIndexOf("/")
                fileProperty.innerHTML = "<u>" + key.substring(indexOfLastDivider + 1, key.length) + "</u>: " + value
                fileProperty.classList.add("fileProperty")
                detailsOfFile.appendChild(fileProperty)
            }

            fileDisplayObj.append(titleOfFile, urlOfFile, detailsOfFile)

            containerDivForFiles.appendChild(fileDisplayObj)
        }
        let medicalRecordsDiv = document.getElementById("accessingRecordsDiv")
        medicalRecordsDiv.appendChild(containerDivForFiles)
        containerDivForFiles.scrollIntoView()

    }
    else alert('Dataset exists but no files are currently held in it.')
}

async function updateDatasetAccess(accessPerson) {
    let indexOfAccessPerson = accessPerson.substring(accessPerson.length - 1, accessPerson.length)
    let previousAccessKey = Object.keys(initialStateOfDatasetAccess)[indexOfAccessPerson]
    let previousAccessValue = initialStateOfDatasetAccess[previousAccessKey]
    let currentAccess = {
        read: document.getElementById("readAccessFor" + indexOfAccessPerson).checked,
        write: document.getElementById("writeAccessFor" + indexOfAccessPerson).checked,
        append: document.getElementById("appendAccessFor" + indexOfAccessPerson).checked,
        controlRead: document.getElementById("controlAccessFor" + indexOfAccessPerson).checked,
        controlWrite: document.getElementById("controlAccessFor" + indexOfAccessPerson).checked
    }
    console.log(currentAccess)
    if (_.isEqual(currentAccess, previousAccessValue)) {
        alert("No change detected from initial access level. Change the values of checkboxes to make updates.")
        return
    }
    else {
        console.log(previousAccessKey)
        console.log(currentlyAccessedDatasetUrl)
        try {
            let isOwner = false
            if (previousAccessKey == accessedPodOwnerUrl) isOwner = true
            let controlValue = currentAccess.controlRead
            delete currentAccess.controlRead; delete currentAccess.controlWrite //Control value is read back in 2 separate values
            currentAccess.control = controlValue    //but written in one value

            await grantAccessToDataset(session, previousAccessKey, currentlyAccessedDatasetUrl, currentAccess, isOwner)
            alert("Individual's access updated successfully.")
            let selectedDepartment = document.getElementById("selectedDepartment").value
            let selectedRecordType = document.getElementById("selectedRecordType").value

            getAccessAndDisplay(selectedRecordType, selectedDepartment)
            return
        }
        catch (err) {
            console.log(err)
        }
    }
    if (currentAccess == previousAccessValue) console.log("they are the same")
}

async function grantNewAccess() {
    let newAgentWebID = document.getElementById("webIDNewAccess").value             //Extract values from div
    let selectedReadAccess = document.getElementById("readAccessForNew").checked
    let selectedWriteAccess = document.getElementById("writeAccessForNew").checked
    let selectedAppendAccess = document.getElementById("appendAccessForNew").checked
    let selectedControlAccess = document.getElementById("controlAccessForNew").checked

    if (initialStateOfDatasetAccess.hasOwnProperty(newAgentWebID)) {        //If person is already listed as an individual with access 
        alert("Individual has already been granted access.")
        document.getElementById("webIDNewAccess").value = ""
        return
    }
    let accessObject = { read: selectedReadAccess, write: selectedWriteAccess, append: selectedAppendAccess, control: selectedControlAccess }

    // ************* Might need to grant them access to the info and health data container too
    await grantAccessToDataset(session, newAgentWebID, currentlyAccessedDatasetUrl, accessObject, false)
    alert('Access granted to new individual successfully.')
    let selectedDepartment = document.getElementById("selectedDepartment").value
    let selectedRecordType = document.getElementById("selectedRecordType").value
    document.getElementById("grantingNewAccessDiv").remove();
    getAccessAndDisplay(selectedRecordType, selectedDepartment)
}

async function saveGeneralRecordDetailsToPod() {
    let date = document.getElementById("generalRecordDate").value
    let title = document.getElementById("generalRecordTitle").value
    let description = document.getElementById("newGeneralRecordDescription").value
    let department = document.getElementById("selectedDepartment").value

    let generalRecordDetails = {
        "https://schema.org/dateCreated": new Date().toUTCString(),
        "https://schema.org/startDate": date,
        "https://schema.org/creator": session.info.webId,
        "https://schema.org/title": title,
        "https://schema.org/description": description,
        "https://schema.org/department": department,
    }
    let urlOfDatasetToUploadFileTo = accessedHealthDataContainerUrl + department + "/Records"
    let uploadResult = await uploadMedicalRecord(session, urlOfDatasetToUploadFileTo, generalRecordDetails)
    if (uploadResult) {
        alert("General record uploaded successfully to pod")
    }
    else {
        alert("Error uploading general record to pod")
    }
    document.getElementById("newGeneralRecordForm").reset();
}

async function savePrescriptionDetailsToPod() {
    let startDate = document.getElementById("prescriptionStartDate").value
    let endDate = document.getElementById("prescriptionEndDate").value
    let title = document.getElementById("prescriptionTitle").value
    let description = document.getElementById("newPrescriptionDescription").value
    let department = document.getElementById("selectedDepartment").value

    let prescriptionDetails = {
        "https://schema.org/dateCreated": new Date().toUTCString(),
        "https://schema.org/startDate": startDate,
        "https://schema.org/endDate": endDate,
        "https://schema.org/creator": session.info.webId,
        "https://schema.org/title": title,
        "https://schema.org/description": description,
        "https://schema.org/department": department,
    }
    let urlOfDatasetToUploadFileTo = accessedHealthDataContainerUrl + department + "/Prescriptions"
    let uploadResult = await uploadMedicalRecord(session, urlOfDatasetToUploadFileTo, prescriptionDetails)
    if (uploadResult) {
        alert("Prescription uploaded successfully to pod")
    }
    else {
        alert("Error uploading prescription to pod")
    }
    let pharmacistToFillPrescription = document.getElementById("prescriptionPharmacist").value
    if (pharmacistToFillPrescription != "") {
        try {
            //**********Might need to grant them access to the info and health data container too */
            await grantAccessToDataset(session, pharmacistToFillPrescription, urlOfDatasetToUploadFileTo, { read: true, write: false, append: false, control: false }, false)
            console.log("permission granted to ", pharmacistToFillPrescription, " successfully.")
        }
        catch (err) {
            console.log(err)
        }
    }
    document.getElementById("newPrescriptionForm").reset();
}

async function saveDiagnosisDetailsToPod() {
    let date = document.getElementById("diagnosisDate").value
    let title = document.getElementById("diagnosisTitle").value
    let description = document.getElementById("newDiagnosisDescription").value
    let department = document.getElementById("selectedDepartment").value

    let diagnosisDetails = {
        "https://schema.org/dateCreated": new Date().toUTCString(),
        "https://schema.org/startDate": date,
        "https://schema.org/creator": session.info.webId,
        "https://schema.org/title": title,
        "https://schema.org/description": description,
        "https://schema.org/department": department,
    }
    let urlOfDatasetToUploadFileTo = accessedHealthDataContainerUrl + department + "/Diagnoses"
    let uploadResult = await uploadMedicalRecord(session, urlOfDatasetToUploadFileTo, diagnosisDetails)
    if (uploadResult) {
        alert("Diagnosis uploaded successfully to pod")
    }
    else {
        alert("Error uploading diagnosis to pod")
    }
    document.getElementById("newDiagnosisForm").reset();
}

async function shareAccessForInsurance(insurerWebID) {
    let departments = document.getElementById("insuranceDiv").getElementsByTagName("li")    
    let departmentNames = []
    for (var i = 0; i < departments.length; i++) {  //Iterate through department that will be shared with the insurer
        departmentNames.push(departments[i].innerText)
    }

    let permissionSetForInsurer = { read: true, write: false, append: false, controlRead: false, controlWrite: false }
    for (var i = 0; i < departmentNames.length; i++) {
        let urlOfDiagnosisDataset = accessedHealthDataContainerUrl + departmentNames[i] + "/Diagnoses"
        if (await checkIfDatasetExists(session, urlOfDiagnosisDataset)) {    //Diagnoses in the current department
            let files = await getFilesInDataset(session, urlOfDiagnosisDataset)
            console.log(files)
            for (var i = 0; i < files.length; i++) {
                console.log(i)
                var startDateOfDiagnosis = getStringNoLocale(files[i], "https://schema.org/startDate")
                console.log(startDateOfDiagnosis)
                var dateAsTimestamp = Date.parse(startDateOfDiagnosis)
                console.log(dateAsTimestamp)
                console.log(Date.now())
                if (Date.now() - dateAsTimestamp <= 157709247)   //Timestamp for 5 years
                {
                    //Grant access to health data dataset first, or check to see if user has been granted access to any container within the health data container
                    let existingDiagnosesForInsurance = await checkIfDatasetExists(session, accessedHealthDataContainerUrl + "InsuranceDiagnoses1")
                    if (existingDiagnosesForInsurance == false) {
                        await createInsuranceDiagnosesDataset(session, accessedHealthDataContainerUrl + "InsuranceDiagnoses1", accessedPodOwnerUrl)
                    }
                    let insurerHasAccess = await checkIfPersonHasAccess(session, accessedHealthDataContainerUrl + "InsuranceDiagnoses1", insurerWebID, permissionSetForInsurer)
                    if (insurerHasAccess == false) {
                        console.log("granting access")
                        await grantAccessToDataset(session, insurerWebID, accessedHealthDataContainerUrl, permissionSetForInsurer, false)
                        await grantAccessToDataset(session, insurerWebID, accessedHealthDataContainerUrl + "Info", permissionSetForInsurer, false)
                        await grantAccessToDataset(session, insurerWebID, accessedHealthDataContainerUrl + "InsuranceDiagnoses1", permissionSetForInsurer, false)
                    }

                    await addThingToDataset(session, accessedHealthDataContainerUrl + "InsuranceDiagnoses1", files[i])
                }
            }
        }
    }
}

async function onDropdownClick(userType) {

    var dropdownOptions = document.getElementById("myDropdown");
    if (dropdownOptions.children.length <= 1) {
        let selectableDepartments = {}
        if (userType == "administrator") {
            selectableDepartments = departments
        }
        else if (userType == "standardUser") {
            selectableDepartments = await getDepartments(session, accessedHealthDataContainerUrl)
            for (var i = 0; i < selectableDepartments.length; i++) {
                selectableDepartments[i] = { label: selectableDepartments[i].substring(selectableDepartments[i].lastIndexOf("HealthData3/") + 12, selectableDepartments[i].length - 1) }
            }
        }

        const departmentList = selectableDepartments;
        for (var i = 0; i <= departmentList.length - 1; i++) {
            //console.log(departmentList[i].label)
            if (departmentList[i].label) {
                let newOption = document.createElement("a")
                const labelValue = departmentList[i].label
                newOption.innerHTML = labelValue
                newOption.onclick = function () {
                    console.log(newOption.innerHTML)
                    document.getElementById('selectedAppointmentDepartmentDropdown').value = labelValue;
                    document.getElementById("departmentDropdownButton").innerHTML = labelValue;
                    document.getElementById('myDropdown').classList.toggle('show');
                }
                dropdownOptions.appendChild(newOption);
            }
        }
    }
    document.getElementById("myDropdown").classList.toggle("show");
}

async function displayPodDiagram() {
    console.log(typesOfHealthData)
    console.log(typesOfHealthDataExists)
    let innerDatasetsWithinDepartment = ['Appointments', 'Diagnoses', 'Prescriptions', 'Records']
    for (var i = 0; i < typesOfHealthData.length; i++) {
        if (typesOfHealthDataExists[i] == true) {
            let divForCurrentHealthDataType = document.getElementById(typesOfHealthData[i] + "HealthDataType")
            divForCurrentHealthDataType.style.backgroundColor = "green"
            let departmentsToBeDisplayed = document.createElement("ul")
            let healthDataContainerUrl = accessedPodOwnerBaseUrl + "/" + typesOfHealthData[i] + "HealthData3/"
            try {
                let departmentsInCurrentHealthDataType = await getDepartments(session, healthDataContainerUrl)
                console.log(departmentsInCurrentHealthDataType)
                for (var j = 0; j < departmentsInCurrentHealthDataType.length; j++) {
                    let item = document.createElement("li")
                    item.classList.add("diagram-outer-department")
                    let departmentNameAsPlaintext = departmentsInCurrentHealthDataType[j].substring(departmentsInCurrentHealthDataType[j].lastIndexOf("HealthData3/") + 12, departmentsInCurrentHealthDataType[j].length - 1)
                    item.innerText = departmentNameAsPlaintext
                    for (var k = 0; k < innerDatasetsWithinDepartment.length; k++) {
                        let innerDept = document.createElement("li")
                        innerDept.classList.add("diagram-inner-dataset")
                        let urlOfCurrentDatasetWithinDepartment = healthDataContainerUrl + departmentNameAsPlaintext + "/" + innerDatasetsWithinDepartment[k]
                        let numberOfFiles = ""
                        try {
                            let files = await getFilesInDataset(session, urlOfCurrentDatasetWithinDepartment)
                            numberOfFiles = files.length + " files"
                        }
                        catch (err) {
                            console.log(err)
                            numberOfFiles = "Unauthorized to view contents"
                        }
                        innerDept.innerText = innerDatasetsWithinDepartment[k] //+ ": " + numberOfFiles
                        let thingsInDept = document.createElement("p")
                        thingsInDept.innerText = numberOfFiles
                        thingsInDept.classList.add("diagram-things")
                        innerDept.appendChild(thingsInDept)
                        item.appendChild(innerDept)
                    }
                    departmentsToBeDisplayed.appendChild(item)
                }
            }
            catch (err) {
                let errorGettingDepartments = document.createElement("li")
                errorGettingDepartments.innerText = "Error retrieving the department list for this department"
                departmentsToBeDisplayed.appendChild(errorGettingDepartments)
            }
            divForCurrentHealthDataType.appendChild(departmentsToBeDisplayed)
        }
    }
}

buttonLogin.onclick = function () {
    login();
};

btnLogout.onclick = function () {
    logout();
}

returnFromAccessingRecords.onclick = function () {
    resetCurrentPodSession(false)
}
returnFromUploadingAppointment.onclick = function () {
    resetCurrentPodSession(false)
}
returnFromUploadingMedicalRecord.onclick = function () {
    resetCurrentPodSession(false);
}
returnFromInsurance.onclick = function () {
    resetCurrentPodSession(false);
}
returnFromPodDiagram.onclick = function () {
    resetCurrentPodSession(false);
}

cancelRegisterNewInsitutionButton.onclick = function () {
    resetCurrentPodSession(true)
}

departmentSelectionForm.addEventListener("submit", (event) => {
    event.preventDefault();
    let selectedDepartment = document.getElementById("selectedDepartment").value
    let selectedRecordType = document.getElementById("selectedRecordType").value
    console.log("getting called")
    getPatientFilesAndDisplay(selectedRecordType, selectedDepartment, false);
})

document.getElementById("viewAccessButton").addEventListener("click", (event) => {
    event.preventDefault();
    let selectedDepartment = document.getElementById("selectedDepartment").value
    let selectedRecordType = document.getElementById("selectedRecordType").value
    getAccessAndDisplay(selectedRecordType, selectedDepartment)
})

document.getElementById("submitInsuranceRequestButton").addEventListener("click", (event) => {
    event.preventDefault();
    let insurerWebID = document.getElementById("insurerWebID").value
    shareAccessForInsurance(insurerWebID);
})


myPodButton.addEventListener('click', (event) => {
    event.preventDefault();
    checkMedicalInstitutionStatus("signedInUser");
});

otherUserPodButton.addEventListener('click', (event) => {
    event.preventDefault();
    checkMedicalInstitutionStatus("specifiedUser");
})


cancelSessionWithPodButton.addEventListener("click", (event) => {
    event.preventDefault();
    resetCurrentPodSession(true)
})


newGeneralRecordForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveGeneralRecordDetailsToPod();
})

newPrescriptionForm.addEventListener("submit", (event) => {
    event.preventDefault();
    savePrescriptionDetailsToPod();
})

newDiagnosisForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveDiagnosisDetailsToPod();
})
selectedDepartmentForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (([accessedHealthDataContainerAdministrator, accessedPodOwnerUrl].includes(session.info.webId))) {
        onDropdownClick("administrator");
    }
    else onDropdownClick("standardUser")
})

saveNewAppointmentDetailsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveNewAppointment();
})

noInstitutionInformationForm.addEventListener("submit", (event) => {
    event.preventDefault();
    document.getElementById("registerNewMedicalInstitution").style.display = "block"
})

newMedicalInstitutionForm.addEventListener("submit", (event) => {
    event.preventDefault();
    registerNewMedicalInstitution();
})

registerNewAppointmentButton.addEventListener("click", (event) => {
    event.preventDefault();
    document.getElementById("accessMedicalRecordsButton").style.display = "none";
    document.getElementById("uploadMedicalRecordsButton").style.display = "none";
    document.getElementById("initiateInsuranceRequestButton").style.display = "none";
    document.getElementById("registerNewMedicalInstitutionButton").style.display = "none";
    document.getElementById("viewPodDiagramButton").style.display = "none"

    document.getElementById("registerNewAppointmentButton").classList.add("clicked-button")
    document.getElementById("uploadNewAppointmentDetails").style.display = "block"
    setTimeout(() => { window.scrollTo(0, document.body.scrollHeight) }, 500)    //Wait half a second then scroll to bottom of page
})

accessMedicalRecordsButton.addEventListener("click", (event) => {
    event.preventDefault();
    document.getElementById("uploadMedicalRecordsButton").style.display = "none";
    document.getElementById("registerNewAppointmentButton").style.display = "none";
    document.getElementById("initiateInsuranceRequestButton").style.display = "none";
    document.getElementById("registerNewMedicalInstitutionButton").style.display = "none";
    document.getElementById("viewPodDiagramButton").style.display = "none"
    document.getElementById("accessMedicalRecordsButton").classList.add("clicked-button")
    getPatientDepartmentsAndDisplay("accessingRecords", "")
    setTimeout(() => { window.scrollTo(0, document.body.scrollHeight) }, 500)    //Wait half a second then scroll to bottom of page
});

initiateInsuranceRequestButton.addEventListener("click", (event) => {
    event.preventDefault();
    document.getElementById("accessMedicalRecordsButton").style.display = "none";
    document.getElementById("registerNewAppointmentButton").style.display = "none";
    document.getElementById("uploadMedicalRecordsButton").style.display = "none";
    document.getElementById("registerNewMedicalInstitutionButton").style.display = "none";
    document.getElementById("viewPodDiagramButton").style.display = "none"
    document.getElementById("initiateInsuranceRequestButton").classList.add("clicked-button")
    document.getElementById("insuranceDiv").style.display = "block"
    setTimeout(() => { window.scrollTo(0, document.body.scrollHeight) }, 500)    //Wait half a second then scroll to bottom of page
})


uploadMedicalRecordsButton.addEventListener("click", (event) => {
    event.preventDefault();
    document.getElementById("accessMedicalRecordsButton").style.display = "none";
    document.getElementById("registerNewAppointmentButton").style.display = "none";
    document.getElementById("initiateInsuranceRequestButton").style.display = "none";
    document.getElementById("registerNewMedicalInstitutionButton").style.display = "none";
    document.getElementById("viewPodDiagramButton").style.display = "none"
    document.getElementById("uploadMedicalRecordsButton").classList.add("clicked-button")
    document.getElementById("uploadNewMedicalRecordDiv").style.display = "block"
    setTimeout(() => { window.scrollTo(0, document.body.scrollHeight) }, 500)    //Wait half a second then scroll to bottom of page
})

registerNewMedicalInstitutionButton.addEventListener("click", (event) => {
    event.preventDefault();
    document.getElementById("accessMedicalRecordsButton").style.display = "none";
    document.getElementById("registerNewAppointmentButton").style.display = "none";
    document.getElementById("initiateInsuranceRequestButton").style.display = "none";
    document.getElementById("uploadMedicalRecordsButton").style.display = "none";
    document.getElementById("viewPodDiagramButton").style.display = "none"
    document.getElementById("registerNewMedicalInstitutionButton").classList.add("clicked-button")
    document.getElementById("registerNewMedicalInstitution").style.display = "block"
    checkMedicalInstitutionStatus("signedInUserNew")
    setTimeout(() => { window.scrollTo(0, document.body.scrollHeight) }, 500)    //Wait half a second then scroll to bottom of page
})

viewPodDiagramButton.addEventListener("click", (event) => {
    event.preventDefault();
    document.getElementById("accessMedicalRecordsButton").style.display = "none";
    document.getElementById("registerNewAppointmentButton").style.display = "none";
    document.getElementById("initiateInsuranceRequestButton").style.display = "none";
    document.getElementById("uploadMedicalRecordsButton").style.display = "none";
    document.getElementById("registerNewMedicalInstitution").style.display = "none"
    document.getElementById("viewPodDiagramButton").classList.add("clicked-button")
    document.getElementById("podDiagramDiv").style.display = "block"
    console.log("Getting called after clicking button");
    displayPodDiagram()
    setTimeout(() => { window.scrollTo(0, document.body.scrollHeight) }, 500)    //Wait half a second then scroll to bottom of page
})

setNameToEditable.addEventListener("click", (event) => {
    event.preventDefault();
    let existingValue = document.getElementById("nameOfInstitution").innerHTML
    existingValue = existingValue.substring(existingValue.lastIndexOf(":") + 2, existingValue.length)
    document.getElementById("nameOfInstitution").style.display = "none"
    let editableField = document.createElement("input")
    editableField.value = existingValue
    editableField.id = "editableInstitutionName"
    editableField.style.width = "50%"
    editableField.addEventListener("keydown", (event) => {
        if (event.key == "Enter") {
            updateMedicalInstitutionField("http://schema.org/name", document.getElementById("editableInstitutionName").value).then(async () => {
                alert("Field updated successfully")
                document.getElementById("setNameToReadOnly").style.display = "none"
                document.getElementById("nameOfInstitution").style.display = "block"
                document.getElementById("setNameToEditable").style.display = "block"
                document.getElementById("editableInstitutionName").remove()
                await selectTypeOfHealthData(accessedHealthDataType)
            })
        }
    })

    document.getElementById("setNameToEditable").parentNode.appendChild(editableField)
    document.getElementById("setNameToEditable").style.display = "none"
    document.getElementById("setNameToReadOnly").style.display = "block"
})
setNameToReadOnly.addEventListener("click", (event) => {
    event.preventDefault();
    document.getElementById("editableInstitutionName").remove();
    document.getElementById("setNameToReadOnly").style.display = "none"
    document.getElementById("nameOfInstitution").style.display = "block"
    document.getElementById("setNameToEditable").style.display = "block"
})

setAddressToEditable.addEventListener("click", (event) => {
    event.preventDefault();
    let existingValue = document.getElementById("addressOfInstitution").innerHTML
    existingValue = existingValue.substring(existingValue.lastIndexOf(":") + 2, existingValue.length)
    document.getElementById("addressOfInstitution").style.display = "none"
    let editableField = document.createElement("input")
    editableField.value = existingValue
    editableField.id = "editableInstitutionAddress"
    editableField.style.width = "50%"
    editableField.addEventListener("keydown", (event) => {
        if (event.key == "Enter") {
            updateMedicalInstitutionField("http://schema.org/address", document.getElementById("editableInstitutionAddress").value).then(async () => {
                alert("Field updated successfully")
                document.getElementById("setAddressToReadOnly").style.display = "none"
                document.getElementById("addressOfInstitution").style.display = "block"
                document.getElementById("setAddressToEditable").style.display = "block"
                document.getElementById("editableInstitutionAddress").remove()
                await selectTypeOfHealthData(accessedHealthDataType)
            })
        }
    })
    document.getElementById("setAddressToEditable").parentNode.appendChild(editableField)
    document.getElementById("setAddressToEditable").style.display = "none"
    document.getElementById("setAddressToReadOnly").style.display = "block"
})
setAddressToReadOnly.addEventListener("click", (event) => {
    event.preventDefault();
    document.getElementById("editableInstitutionAddress").remove();
    document.getElementById("setAddressToReadOnly").style.display = "none"
    document.getElementById("addressOfInstitution").style.display = "block"
    document.getElementById("setAddressToEditable").style.display = "block"
})

setAdministratorToEditable.addEventListener("click", (event) => {
    event.preventDefault();
    let existingValue = document.getElementById("administratorOfInstitution").innerHTML
    existingValue = existingValue.substring(existingValue.indexOf(":") + 2, existingValue.length)
    document.getElementById("administratorOfInstitution").style.display = "none"
    let editableField = document.createElement("input")
    editableField.value = existingValue
    editableField.id = "editableInstitutionAdministrator"
    editableField.style.width = "50%"
    editableField.addEventListener("keydown", (event) => {
        if (event.key == "Enter") {
            try {    //Validate the value they entered is a URL
                let UrlVersionOfString = new URL(document.getElementById("editableInstitutionAdministrator").value)
            }
            catch (err) {
                alert('Value entered is not a valid URL')
                return
            }
            updateMedicalInstitutionField("https://schema.org/member", document.getElementById("editableInstitutionAdministrator").value).then(async () => {
                let noAccess = { read: false, append: false, write: false, controlRead: false, controlWrite: false }
                let administratorAccess = { read: true, append: true, write: true, control: true }
                await grantAccessToDataset(session, existingValue, accessedHealthDataContainerUrl, noAccess, false)                 //Revoke access
                await grantAccessToDataset(session, existingValue, accessedHealthDataContainerUrl + "Info", noAccess, false)        // from previous
                await grantAccessToDataset(session, document.getElementById("editableInstitutionAdministrator").value, accessedHealthDataContainerUrl, administratorAccess, false)             //Grant access 
                await grantAccessToDataset(session, document.getElementById("editableInstitutionAdministrator").value, accessedHealthDataContainerUrl + "Info", administratorAccess, false)    // to new

                alert("Field updated successfully")
                document.getElementById("setAdministratorToReadOnly").style.display = "none"
                document.getElementById("administratorOfInstitution").style.display = "block"
                document.getElementById("setAdministratorToEditable").style.display = "block"
                document.getElementById("administratorTooltip").style.display = "block"
                document.getElementById("warningMessageForUpdatingAdmin").remove()
                document.getElementById("editableInstitutionAdministrator").remove()
                await selectTypeOfHealthData(accessedHealthDataType)
            })
        }
    })
    let warningMessage = document.createElement("p")
    warningMessage.id = "warningMessageForUpdatingAdmin"
    warningMessage.innerText = "WARNING: Changing the WebID of the administrator for this institution will remove all access that was assigned to the previous administrator"
    warningMessage.style.color = "red"
    document.getElementById("setAdministratorToEditable").parentNode.appendChild(warningMessage)
    document.getElementById("setAdministratorToEditable").parentNode.appendChild(editableField)
    document.getElementById("setAdministratorToEditable").style.display = "none"
    document.getElementById("administratorTooltip").style.display = "none"
    document.getElementById("setAdministratorToReadOnly").style.display = "block"
})
setAdministratorToReadOnly.addEventListener("click", (event) => {
    event.preventDefault();
    document.getElementById("warningMessageForUpdatingAdmin").remove();
    document.getElementById("editableInstitutionAdministrator").remove();
    document.getElementById("setAdministratorToReadOnly").style.display = "none"
    document.getElementById("administratorTooltip").style.display = "block"
    document.getElementById("administratorOfInstitution").style.display = "block"
    document.getElementById("setAdministratorToEditable").style.display = "block"
})


continueWithSelectedRecordTypeButton.addEventListener("click", (event) => {
    event.preventDefault();
    if (document.getElementById("diagnosisCheckbox").checked) {
        document.getElementById("medicalRecordTypeSelection").style.display = "none"
        getPatientDepartmentsAndDisplay("uploadingNewRecord", "newDiagnosisDepartmentPlaceholderDiv")
        document.getElementById("createNewDiagnosisDiv").style.display = "block"
        document.getElementById("createNewDiagnosisDiv").scrollIntoView();
        return;
    }
    if (document.getElementById("prescriptionCheckbox").checked) {
        document.getElementById("medicalRecordTypeSelection").style.display = "none"
        getPatientDepartmentsAndDisplay("uploadingNewRecord", "newPrescriptionDepartmentPlaceholderDiv")
        document.getElementById("createNewPrescriptionDiv").style.display = "block";
        return;
    }
    if (document.getElementById("recordCheckbox").checked) {
        document.getElementById("medicalRecordTypeSelection").style.display = "none"
        getPatientDepartmentsAndDisplay("uploadingNewRecord", "newRecordDepartmentPlaceholderDiv")
        document.getElementById("createNewGeneralRecordDiv").style.display = "block"
        document.getElementById("createNewGeneralRecordDiv").scrollIntoView();
        return;
    }
    alert('No record type to upload has been selected. Please select one to continue.')
})



// ////////////////////////////////////////////////////////////

writeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    writeProfile();
});

createAclForm.addEventListener("submit", (event) => {
    event.preventDefault();
    createAclForDataset();
});

readAgentAccessForm.addEventListener("submit", (event) => {
    event.preventDefault();
    readAgentAccess();
});

readDatasetForm.addEventListener("submit", (event) => {
    event.preventDefault();
    readDataset();
});

giveAccessForm.addEventListener("submit", (event) => {
    event.preventDefault();
    grantAccess();
})

readPrivateForm.addEventListener("submit", (event) => {
    event.preventDefault();
    readPrivateFile();
});

uploadFileForm.addEventListener("submit", (event) => {
    event.preventDefault();
    uploadFile();
});

deleteFileForm.addEventListener("submit", (event) => {
    event.preventDefault();
    deleteFileFromUrl();
})

